package app

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
)

// Two kinds of order share one lifecycle table:
//   retail    – a patient reserves medicine at a pharmacy and pays at pickup.
//   wholesale – a pharmacy buys stock from a manufacturer or importer; accepting it ships the packs.

type OrderParty struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	City    string `json:"city"`
	Address string `json:"address"`
	Phone   string `json:"phone"`
}

type OrderItem struct {
	ProductID            string  `json:"product_id"`
	Name                 string  `json:"name"`
	Strength             string  `json:"strength"`
	DosageForm           string  `json:"dosage_form"`
	RequiresPrescription bool    `json:"requires_prescription"`
	Quantity             int     `json:"quantity"`
	UnitPrice            float64 `json:"unit_price"`
	LineTotal            float64 `json:"line_total"`
}

type OrderPack struct {
	Code        string `json:"code"`
	ProductName string `json:"product_name"`
	BatchNumber string `json:"batch_number"`
	ExpiresOn   string `json:"expires_on"`
}

type Order struct {
	ID                   string      `json:"id"`
	Reference            string      `json:"reference"`
	Kind                 string      `json:"kind"`
	Status               string      `json:"status"`
	Buyer                OrderParty  `json:"buyer"`
	Seller               OrderParty  `json:"seller"`
	Items                []OrderItem `json:"items"`
	Total                float64     `json:"total"`
	Currency             string      `json:"currency"`
	Note                 string      `json:"note"`
	DeclineReason        string      `json:"decline_reason"`
	ShipmentID           *string     `json:"shipment_id"`
	RequiresPrescription bool        `json:"requires_prescription"`
	Packs                []OrderPack `json:"packs"`
	CreatedAt            time.Time   `json:"created_at"`
	UpdatedAt            time.Time   `json:"updated_at"`
	ClosedAt             *time.Time  `json:"closed_at"`
}

const orderSelect = `SELECT o.id, o.reference, o.kind, o.status, o.total::float8, o.currency, o.note, o.decline_reason,
	o.shipment_id, o.created_at, o.updated_at, o.closed_at,
	s.id, s.name, s.type, s.city, s.address, s.phone,
	coalesce(bo.id::text, bu.id::text), coalesce(bo.name, bu.full_name), coalesce(bo.type, 'patient'),
	coalesce(bo.city, ''), coalesce(bo.address, ''), coalesce(nullif(bo.phone, ''), bu.phone)
	FROM orders o
	JOIN organizations s ON s.id = o.seller_org_id
	JOIN users bu ON bu.id = o.buyer_user_id
	LEFT JOIN organizations bo ON bo.id = o.buyer_org_id`

func scanOrder(row pgx.Row, o *Order) error {
	return row.Scan(&o.ID, &o.Reference, &o.Kind, &o.Status, &o.Total, &o.Currency, &o.Note, &o.DeclineReason,
		&o.ShipmentID, &o.CreatedAt, &o.UpdatedAt, &o.ClosedAt,
		&o.Seller.ID, &o.Seller.Name, &o.Seller.Type, &o.Seller.City, &o.Seller.Address, &o.Seller.Phone,
		&o.Buyer.ID, &o.Buyer.Name, &o.Buyer.Type, &o.Buyer.City, &o.Buyer.Address, &o.Buyer.Phone)
}

// orderVisible restricts orders to their buyer, their seller, or admins.
const orderVisible = `($1 OR (o.kind = 'retail' AND o.buyer_user_id::text = $2)
	OR o.buyer_org_id::text = $3 OR o.seller_org_id::text = $3)`

func visibilityArgs(actor *Actor) []any { return []any{actor.IsAdmin(), actor.UserID, actor.OrgID} }

type OrderItemInput struct {
	ProductID string `json:"product_id"`
	Quantity  int    `json:"quantity"`
}

type OrderInput struct {
	SellerID string           `json:"seller_id"`
	Items    []OrderItemInput `json:"items"`
	Note     string           `json:"note"`
}

// lockSeller serialises stock decisions for one seller so two confirmations can't promise the same packs.
func lockSeller(ctx context.Context, tx pgx.Tx, sellerID string) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('seller:' || $1))`, sellerID)
	return err
}

// available is what a seller can still promise for a product.
func available(ctx context.Context, tx pgx.Tx, sellerID, productID, exceptOrderID string) (int, error) {
	sellable, err := sellableCount(ctx, tx, sellerID, productID)
	if err != nil {
		return 0, err
	}
	reserved, err := reservedCount(ctx, tx, sellerID, productID, exceptOrderID)
	if err != nil {
		return 0, err
	}
	return sellable - reserved, nil
}

func (a *App) CreateOrder(ctx context.Context, actor *Actor, in OrderInput) (*Order, error) {
	var kind string
	switch {
	case actor != nil && actor.Role == RolePatient:
		kind = "retail"
	case actor != nil && actor.Role == RolePharmacy:
		if err := requireActiveOrg(actor, RolePharmacy); err != nil {
			return nil, err
		}
		kind = "wholesale"
	default:
		return nil, errForbidden("Only patients and pharmacies place orders.")
	}
	maxQty := 50
	if kind == "wholesale" {
		maxQty = 10000
	}
	v := Validator{}
	v.Check(IsUUID(in.SellerID), "seller_id", "Choose where to order from.")
	v.Check(len(in.Items) > 0, "items", "Add at least one medicine.")
	v.Check(len(in.Items) <= 20, "items", "An order can have at most 20 items.")
	v.Check(len(in.Note) <= 1000, "note", "Keep the note under 1000 characters.")
	seen := map[string]bool{}
	for i, it := range in.Items {
		f := fmt.Sprintf("items.%d", i)
		v.Check(IsUUID(it.ProductID), f+".product_id", "Choose a medicine.")
		v.Check(!seen[it.ProductID], f+".product_id", "This medicine is already in the order.")
		v.Check(it.Quantity >= 1 && it.Quantity <= maxQty, f+".quantity", fmt.Sprintf("Order between 1 and %d packs.", maxQty))
		seen[it.ProductID] = true
	}
	if err := v.Err(); err != nil {
		return nil, err
	}

	var orderID string
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		var sellerType, sellerStatus, sellerName string
		err := tx.QueryRow(ctx, `SELECT type, status, name FROM organizations WHERE id = $1`, in.SellerID).Scan(&sellerType, &sellerStatus, &sellerName)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && (sellerStatus != "active" || len(filterStrings(sellerTypes[sideOf(kind)], sellerType)) == 0)) {
			return errInvalid(map[string]string{"seller_id": "This seller isn't available."})
		}
		if err != nil {
			return err
		}
		if err := lockSeller(ctx, tx, in.SellerID); err != nil {
			return err
		}

		var seq int64
		if err := tx.QueryRow(ctx, `SELECT nextval('order_reference_seq')`).Scan(&seq); err != nil {
			return err
		}
		reference := fmt.Sprintf("ORD-%d-%06d", a.Now().Year(), seq)
		var buyerOrg *string
		if kind == "wholesale" {
			buyerOrg = &actor.OrgID
		}
		if err := tx.QueryRow(ctx, `INSERT INTO orders (reference, kind, buyer_user_id, buyer_org_id, seller_org_id, note)
			VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, reference, kind, actor.UserID, buyerOrg, in.SellerID, trim(in.Note)).Scan(&orderID); err != nil {
			return err
		}

		total := 0.0
		for i, it := range in.Items {
			f := fmt.Sprintf("items.%d", i)
			var price float64
			var name string
			err := tx.QueryRow(ctx, `SELECT l.unit_price::float8, p.name || ' ' || p.strength FROM listings l JOIN products p ON p.id = l.product_id
				WHERE l.organization_id = $1 AND l.product_id = $2 AND l.is_listed AND p.status = 'active'`, in.SellerID, it.ProductID).Scan(&price, &name)
			if errors.Is(err, pgx.ErrNoRows) {
				return errInvalid(map[string]string{f + ".product_id": "This medicine isn't offered by " + sellerName + "."})
			}
			if err != nil {
				return err
			}
			avail, err := available(ctx, tx, in.SellerID, it.ProductID, "")
			if err != nil {
				return err
			}
			if avail < it.Quantity {
				return errInvalid(map[string]string{f + ".quantity": fmt.Sprintf("Only %d packs of %s available.", max(avail, 0), name)})
			}
			if _, err := tx.Exec(ctx, `INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`,
				orderID, it.ProductID, it.Quantity, price); err != nil {
				return err
			}
			total += price * float64(it.Quantity)
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET total = $2 WHERE id = $1`, orderID, math.Round(total*100)/100); err != nil {
			return err
		}

		title := "New customer order " + reference
		if kind == "wholesale" {
			title = "New purchase order " + reference
		}
		if err := a.notify(ctx, tx, notice{OrgID: in.SellerID, Kind: "order_new", Title: title,
			Body: "Review and accept it, or decline with a reason.", Link: "/app/orders/" + orderID}); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "order.created", "order", orderID, map[string]any{"reference": reference, "kind": kind})
	})
	if err != nil {
		return nil, err
	}
	return a.GetOrder(ctx, actor, orderID)
}

func sideOf(kind string) string {
	if kind == "retail" {
		return "retail"
	}
	return "supply"
}

func (a *App) GetOrder(ctx context.Context, actor *Actor, id string) (*Order, error) {
	if actor == nil {
		return nil, ErrUnauthorized
	}
	if !IsUUID(id) {
		return nil, errNotFound("Order")
	}
	var o Order
	err := scanOrder(a.DB.QueryRow(ctx, orderSelect+` WHERE o.id = $4 AND `+orderVisible, append(visibilityArgs(actor), id)...), &o)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound("Order")
	}
	if err != nil {
		return nil, err
	}
	if err := a.loadOrderDetails(ctx, &o); err != nil {
		return nil, err
	}
	return &o, nil
}

func (a *App) loadOrderDetails(ctx context.Context, o *Order) error {
	rows, err := a.DB.Query(ctx, `SELECT p.id, p.name, p.strength, p.dosage_form, p.requires_prescription, oi.quantity, oi.unit_price::float8
		FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1 ORDER BY p.name`, o.ID)
	if err != nil {
		return err
	}
	o.Items, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (OrderItem, error) {
		var it OrderItem
		err := r.Scan(&it.ProductID, &it.Name, &it.Strength, &it.DosageForm, &it.RequiresPrescription, &it.Quantity, &it.UnitPrice)
		it.LineTotal = math.Round(it.UnitPrice*float64(it.Quantity)*100) / 100
		if it.RequiresPrescription {
			o.RequiresPrescription = true
		}
		return it, err
	})
	if err != nil {
		return err
	}
	rows, err = a.DB.Query(ctx, `SELECT u.code, p.name || ' ' || p.strength, b.batch_number, to_char(b.expires_on, 'YYYY-MM-DD')
		FROM units u JOIN batches b ON b.id = u.batch_id JOIN products p ON p.id = b.product_id
		WHERE u.order_id = $1 ORDER BY p.name, u.serial`, o.ID)
	if err != nil {
		return err
	}
	o.Packs, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (OrderPack, error) {
		var pk OrderPack
		err := r.Scan(&pk.Code, &pk.ProductName, &pk.BatchNumber, &pk.ExpiresOn)
		pk.Code = FormatCode(pk.Code)
		return pk, err
	})
	return err
}

type OrderFilter struct {
	PageParams
	Side   string // buying | selling | "" (both)
	Status string
}

func (a *App) ListOrders(ctx context.Context, actor *Actor, f OrderFilter) (*Page[Order], error) {
	if actor == nil {
		return nil, ErrUnauthorized
	}
	f.PageParams = f.normalized()
	where := ` WHERE ` + orderVisible + `
		AND ($4 = '' OR ($4 = 'buying' AND (o.buyer_org_id::text = $3 OR (o.kind = 'retail' AND o.buyer_user_id::text = $2)))
			OR ($4 = 'selling' AND o.seller_org_id::text = $3))
		AND ($5 = '' OR o.status = $5)`
	args := append(visibilityArgs(actor), f.Side, f.Status)
	page := &Page[Order]{Items: []Order{}, Limit: f.Limit, Offset: f.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM orders o`+where, args...).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, orderSelect+where+` ORDER BY o.created_at DESC LIMIT $6 OFFSET $7`, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var o Order
		if err := scanOrder(rows, &o); err != nil {
			return nil, err
		}
		page.Items = append(page.Items, o)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range page.Items {
		if err := a.loadOrderDetails(ctx, &page.Items[i]); err != nil {
			return nil, err
		}
	}
	return page, nil
}

// lockedOrder loads an order row for update and the facts needed to change it.
type lockedOrder struct {
	id, reference, kind, status, sellerID, buyerUserID string
	buyerOrgID                                         *string
}

func lockOrder(ctx context.Context, tx pgx.Tx, id string) (*lockedOrder, error) {
	var o lockedOrder
	err := tx.QueryRow(ctx, `SELECT id, reference, kind, status, seller_org_id, buyer_user_id, buyer_org_id FROM orders WHERE id = $1 FOR UPDATE`, id).
		Scan(&o.id, &o.reference, &o.kind, &o.status, &o.sellerID, &o.buyerUserID, &o.buyerOrgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound("Order")
	}
	return &o, err
}

func (o *lockedOrder) isSeller(actor *Actor) bool {
	return actor.OrgID != "" && actor.OrgID == o.sellerID
}
func (o *lockedOrder) isBuyer(actor *Actor) bool {
	if o.kind == "retail" {
		return actor.UserID == o.buyerUserID
	}
	return o.buyerOrgID != nil && actor.OrgID == *o.buyerOrgID
}

// notifyBuyer reaches the patient (retail) or the buying pharmacy (wholesale).
func (a *App) notifyBuyer(ctx context.Context, tx pgx.Tx, o *lockedOrder, kind, title, body string) error {
	n := notice{Kind: kind, Title: title, Body: body, Link: "/app/orders/" + o.id}
	if o.kind == "retail" {
		n.UserID = o.buyerUserID
	} else {
		n.OrgID = *o.buyerOrgID
	}
	return a.notify(ctx, tx, n)
}

type orderItemRow struct {
	productID, name string
	quantity        int
}

func orderItemsTx(ctx context.Context, tx pgx.Tx, orderID string) ([]orderItemRow, error) {
	rows, err := tx.Query(ctx, `SELECT oi.product_id, p.name || ' ' || p.strength, oi.quantity
		FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = $1`, orderID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (orderItemRow, error) {
		var it orderItemRow
		err := r.Scan(&it.productID, &it.name, &it.quantity)
		return it, err
	})
}

// pickFEFOTx locks the seller's sellable packs of a product, earliest expiry first.
func pickFEFOTx(ctx context.Context, tx pgx.Tx, orgID, productID string, qty int) ([]int64, []string, error) {
	rows, err := tx.Query(ctx, `SELECT u.id, u.batch_id FROM units u JOIN batches b ON b.id = u.batch_id
		WHERE u.holder_id = $1 AND u.status = 'in_stock' AND b.product_id = $2
		  AND b.recalled_at IS NULL AND b.expires_on > current_date
		ORDER BY b.expires_on, u.serial LIMIT $3 FOR UPDATE OF u`, orgID, productID, qty)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var ids []int64
	var batches []string
	for rows.Next() {
		var id int64
		var batch string
		if err := rows.Scan(&id, &batch); err != nil {
			return nil, nil, err
		}
		ids = append(ids, id)
		batches = append(batches, batch)
	}
	return ids, batches, rows.Err()
}

// AcceptOrder: for a retail order the pharmacy confirms and holds the stock for pickup;
// for a wholesale order the supplier ships the packs (earliest expiry first) as a tracked shipment.
func (a *App) AcceptOrder(ctx context.Context, actor *Actor, id string) (*Order, error) {
	if err := requireActiveOrg(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("Order")
	}
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		o, err := lockOrder(ctx, tx, id)
		if err != nil {
			return err
		}
		if !o.isSeller(actor) {
			return errNotFound("Order")
		}
		if o.status != "pending" {
			return errConflict("This order is already " + o.status + ".")
		}
		if err := lockSeller(ctx, tx, o.sellerID); err != nil {
			return err
		}
		items, err := orderItemsTx(ctx, tx, o.id)
		if err != nil {
			return err
		}

		if o.kind == "retail" {
			for _, it := range items {
				avail, err := available(ctx, tx, o.sellerID, it.productID, o.id)
				if err != nil {
					return err
				}
				if avail < it.quantity {
					return errConflict(fmt.Sprintf("Only %d packs of %s available — decline the order or restock first.", max(avail, 0), it.name))
				}
			}
			if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'confirmed', updated_at = now() WHERE id = $1`, o.id); err != nil {
				return err
			}
			var seller string
			if err := tx.QueryRow(ctx, `SELECT name FROM organizations WHERE id = $1`, o.sellerID).Scan(&seller); err != nil {
				return err
			}
			if err := a.notifyBuyer(ctx, tx, o, "order_confirmed", "Order "+o.reference+" is ready for pickup",
				seller+" is holding your medicine. Pay when you collect it."); err != nil {
				return err
			}
			return a.audit(ctx, tx, actor, "order.confirmed", "order", o.id, map[string]any{"reference": o.reference})
		}

		// Wholesale: ship it.
		if err := checkRecipientTx(ctx, tx, actor, *o.buyerOrgID); err != nil {
			return errConflict("This pharmacy can't receive shipments right now.")
		}
		shipmentID, shipRef, err := a.openShipmentTx(ctx, tx, actor, *o.buyerOrgID, "For order "+o.reference)
		if err != nil {
			return err
		}
		for _, it := range items {
			ids, batches, err := pickFEFOTx(ctx, tx, actor.OrgID, it.productID, it.quantity)
			if err != nil {
				return err
			}
			if len(ids) < it.quantity {
				return errConflict(fmt.Sprintf("Only %d sellable packs of %s in stock — decline the order or restock first.", len(ids), it.name))
			}
			// Group the picked packs by batch, keeping FEFO order.
			byBatch := map[string][]int64{}
			var order []string
			for i, b := range batches {
				if _, ok := byBatch[b]; !ok {
					order = append(order, b)
				}
				byBatch[b] = append(byBatch[b], ids[i])
			}
			for _, b := range order {
				if err := loadUnitsTx(ctx, tx, shipmentID, b, byBatch[b]); err != nil {
					return err
				}
			}
		}
		if err := a.sendShipmentTx(ctx, tx, actor, shipmentID, shipRef, *o.buyerOrgID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'accepted', shipment_id = $2, updated_at = now() WHERE id = $1`, o.id, shipmentID); err != nil {
			return err
		}
		if err := a.notifyBuyer(ctx, tx, o, "order_accepted", "Order "+o.reference+" accepted and shipped",
			"It's on the way as shipment "+shipRef+". Receive it in MediTrack when it arrives."); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "order.accepted", "order", o.id, map[string]any{"reference": o.reference, "shipment": shipRef})
	})
	if err != nil {
		return nil, err
	}
	return a.GetOrder(ctx, actor, id)
}

func (a *App) RejectOrder(ctx context.Context, actor *Actor, id, reason string) (*Order, error) {
	if err := requireRole(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("Order")
	}
	if len(trim(reason)) < 3 {
		return nil, errInvalid(map[string]string{"reason": "Tell the buyer why you're declining."})
	}
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		o, err := lockOrder(ctx, tx, id)
		if err != nil {
			return err
		}
		if !o.isSeller(actor) {
			return errNotFound("Order")
		}
		if o.status != "pending" && !(o.kind == "retail" && o.status == "confirmed") {
			return errConflict("This order is already " + o.status + ".")
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'rejected', decline_reason = $2, updated_at = now(), closed_at = now() WHERE id = $1`,
			o.id, trim(reason)); err != nil {
			return err
		}
		if err := a.notifyBuyer(ctx, tx, o, "order_rejected", "Order "+o.reference+" was declined", trim(reason)); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "order.rejected", "order", o.id, map[string]any{"reason": reason})
	})
	if err != nil {
		return nil, err
	}
	return a.GetOrder(ctx, actor, id)
}

func (a *App) CancelOrder(ctx context.Context, actor *Actor, id string) (*Order, error) {
	if actor == nil {
		return nil, ErrUnauthorized
	}
	if !IsUUID(id) {
		return nil, errNotFound("Order")
	}
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		o, err := lockOrder(ctx, tx, id)
		if err != nil {
			return err
		}
		if !o.isBuyer(actor) {
			return errNotFound("Order")
		}
		if o.status != "pending" && !(o.kind == "retail" && o.status == "confirmed") {
			return errConflict("This order is already " + o.status + " and can't be cancelled.")
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'cancelled', updated_at = now(), closed_at = now() WHERE id = $1`, o.id); err != nil {
			return err
		}
		if err := a.notify(ctx, tx, notice{OrgID: o.sellerID, Kind: "order_cancelled", Title: "Order " + o.reference + " was cancelled by the buyer",
			Link: "/app/orders/" + o.id}); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "order.cancelled", "order", o.id, nil)
	})
	if err != nil {
		return nil, err
	}
	return a.GetOrder(ctx, actor, id)
}

// CompleteOrder: the patient collected and paid. The pharmacy hands over specific packs
// (earliest expiry first); they're recorded as dispensed against the order so the patient
// can verify each one.
func (a *App) CompleteOrder(ctx context.Context, actor *Actor, id string) (*Order, error) {
	if err := requireActiveOrg(actor, RolePharmacy); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("Order")
	}
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		o, err := lockOrder(ctx, tx, id)
		if err != nil {
			return err
		}
		if !o.isSeller(actor) || o.kind != "retail" {
			return errNotFound("Order")
		}
		if o.status != "confirmed" {
			return errConflict("Only confirmed orders can be completed; this one is " + o.status + ".")
		}
		items, err := orderItemsTx(ctx, tx, o.id)
		if err != nil {
			return err
		}
		touched := map[string]bool{}
		var all []int64
		for _, it := range items {
			ids, _, err := pickFEFOTx(ctx, tx, actor.OrgID, it.productID, it.quantity)
			if err != nil {
				return err
			}
			if len(ids) < it.quantity {
				return errConflict(fmt.Sprintf("Only %d sellable packs of %s left in stock.", len(ids), it.name))
			}
			all = append(all, ids...)
			touched[it.productID] = true
		}
		// The order's own reservation is released by completing it, so measure low stock against what's left after.
		before, err := sellableCounts(ctx, tx, actor.OrgID, touched)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE units SET status = 'dispensed', holder_id = NULL, dispensed_at = now(),
				dispensed_by_org = $2, order_id = $3 WHERE id = ANY($1)`, all, actor.OrgID, o.id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'completed', updated_at = now(), closed_at = now() WHERE id = $1`, o.id); err != nil {
			return err
		}
		if err := a.lowStockAlertsTx(ctx, tx, actor.OrgID, before); err != nil {
			return err
		}
		if err := a.notifyBuyer(ctx, tx, o, "order_completed", "Order "+o.reference+" collected",
			"Thank you. Open the order to verify each pack you received."); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "order.completed", "order", o.id, map[string]any{"packs": len(all)})
	})
	if err != nil {
		return nil, err
	}
	return a.GetOrder(ctx, actor, id)
}
