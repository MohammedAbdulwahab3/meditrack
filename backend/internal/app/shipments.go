package app

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type Party struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	City string `json:"city"`
}

type ShipmentLine struct {
	BatchID     string `json:"batch_id"`
	BatchNumber string `json:"batch_number"`
	ProductID   string `json:"product_id"`
	ProductName string `json:"product_name"`
	Strength    string `json:"strength"`
	DosageForm  string `json:"dosage_form"`
	ExpiresOn   string `json:"expires_on"`
	Recalled    bool   `json:"recalled"`
	Quantity    int    `json:"quantity"`
}

type Shipment struct {
	ID              string         `json:"id"`
	Reference       string         `json:"reference"`
	From            Party          `json:"from"`
	To              Party          `json:"to"`
	Status          string         `json:"status"`
	Notes           string         `json:"notes"`
	RejectionReason string         `json:"rejection_reason"`
	TotalUnits      int            `json:"total_units"`
	CreatedAt       time.Time      `json:"created_at"`
	ClosedAt        *time.Time     `json:"closed_at"`
	Lines           []ShipmentLine `json:"lines,omitempty"`
}

const shipmentSelect = `SELECT s.id, s.reference, f.id, f.name, f.type, f.city, t.id, t.name, t.type, t.city,
	s.status, s.notes, s.rejection_reason,
	(SELECT coalesce(sum(quantity), 0) FROM shipment_lines l WHERE l.shipment_id = s.id),
	s.created_at, s.closed_at
	FROM shipments s
	JOIN organizations f ON f.id = s.from_org_id
	JOIN organizations t ON t.id = s.to_org_id`

func scanShipment(row pgx.Row, s *Shipment) error {
	return row.Scan(&s.ID, &s.Reference, &s.From.ID, &s.From.Name, &s.From.Type, &s.From.City,
		&s.To.ID, &s.To.Name, &s.To.Type, &s.To.City, &s.Status, &s.Notes, &s.RejectionReason,
		&s.TotalUnits, &s.CreatedAt, &s.ClosedAt)
}

type ShipmentLineInput struct {
	BatchID  string `json:"batch_id"`
	Quantity int    `json:"quantity"`
}

type ShipmentInput struct {
	ToOrgID string              `json:"to_org_id"`
	Notes   string              `json:"notes"`
	Lines   []ShipmentLineInput `json:"lines"`
}

func (a *App) CreateShipment(ctx context.Context, actor *Actor, in ShipmentInput) (*Shipment, error) {
	if err := requireActiveOrg(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return nil, err
	}
	v := Validator{}
	v.Check(IsUUID(in.ToOrgID), "to_org_id", "Choose a recipient.")
	v.Check(in.ToOrgID != actor.OrgID, "to_org_id", "You can't ship to yourself.")
	v.Check(len(in.Lines) > 0, "lines", "Add at least one batch.")
	v.Check(len(in.Lines) <= 50, "lines", "A shipment can have at most 50 lines.")
	seen := map[string]bool{}
	for i, l := range in.Lines {
		f := fmt.Sprintf("lines.%d", i)
		v.Check(IsUUID(l.BatchID), f+".batch_id", "Choose a batch.")
		v.Check(!seen[l.BatchID], f+".batch_id", "This batch is already in the shipment.")
		v.Check(l.Quantity > 0, f+".quantity", "Enter a quantity.")
		seen[l.BatchID] = true
	}
	if err := v.Err(); err != nil {
		return nil, err
	}

	var shipmentID string
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		if err := checkRecipientTx(ctx, tx, actor, in.ToOrgID); err != nil {
			return err
		}
		var err error
		var reference string
		shipmentID, reference, err = a.openShipmentTx(ctx, tx, actor, in.ToOrgID, in.Notes)
		if err != nil {
			return err
		}
		for i, l := range in.Lines {
			f := fmt.Sprintf("lines.%d", i)
			var recalled, expired bool
			var label string
			err := tx.QueryRow(ctx, `SELECT b.recalled_at IS NOT NULL, b.expires_on <= current_date, p.name || ' / ' || b.batch_number
				FROM batches b JOIN products p ON p.id = b.product_id WHERE b.id = $1`, l.BatchID).Scan(&recalled, &expired, &label)
			if errors.Is(err, pgx.ErrNoRows) {
				return errInvalid(map[string]string{f + ".batch_id": "Batch not found."})
			}
			if err != nil {
				return err
			}
			if recalled {
				return errInvalid(map[string]string{f + ".batch_id": label + " is recalled and can't be shipped."})
			}
			if expired {
				return errInvalid(map[string]string{f + ".batch_id": label + " is expired and can't be shipped."})
			}
			rows, err := tx.Query(ctx, `SELECT id FROM units WHERE holder_id = $1 AND batch_id = $2 AND status = 'in_stock'
				ORDER BY serial LIMIT $3 FOR UPDATE`, actor.OrgID, l.BatchID, l.Quantity)
			if err != nil {
				return err
			}
			ids, err := pgx.CollectRows(rows, pgx.RowTo[int64])
			if err != nil {
				return err
			}
			if len(ids) < l.Quantity {
				return errInvalid(map[string]string{f + ".quantity": fmt.Sprintf("Only %d packs of %s in stock.", len(ids), label)})
			}
			if err := loadUnitsTx(ctx, tx, shipmentID, l.BatchID, ids); err != nil {
				return err
			}
		}
		return a.sendShipmentTx(ctx, tx, actor, shipmentID, reference, in.ToOrgID)
	})
	if err != nil {
		return nil, err
	}
	return a.GetShipment(ctx, actor, shipmentID)
}

// checkRecipientTx verifies the recipient exists, is active, and may receive from the actor's org type.
func checkRecipientTx(ctx context.Context, tx pgx.Tx, actor *Actor, toOrgID string) error {
	var toType, toStatus string
	err := tx.QueryRow(ctx, `SELECT type, status FROM organizations WHERE id = $1`, toOrgID).Scan(&toType, &toStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return errInvalid(map[string]string{"to_org_id": "Recipient not found."})
	}
	if err != nil {
		return err
	}
	if toStatus != "active" {
		return errInvalid(map[string]string{"to_org_id": "This organization isn't active on MediTrack."})
	}
	if len(filterStrings(allowedRecipients[actor.Role], toType)) == 0 {
		return errInvalid(map[string]string{"to_org_id": fmt.Sprintf("A %s can't ship to a %s.", actor.Role, toType)})
	}
	return nil
}

// openShipmentTx creates an empty in-transit shipment from the actor's organization.
func (a *App) openShipmentTx(ctx context.Context, tx pgx.Tx, actor *Actor, toOrgID, notes string) (id, reference string, err error) {
	var seq int64
	if err = tx.QueryRow(ctx, `SELECT nextval('shipment_reference_seq')`).Scan(&seq); err != nil {
		return "", "", err
	}
	reference = fmt.Sprintf("SHP-%d-%06d", a.Now().Year(), seq)
	err = tx.QueryRow(ctx, `INSERT INTO shipments (reference, from_org_id, to_org_id, notes, created_by)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`, reference, actor.OrgID, toOrgID, trim(notes), actor.UserID).Scan(&id)
	return id, reference, err
}

// loadUnitsTx moves already-locked in-stock units of one batch into a shipment.
func loadUnitsTx(ctx context.Context, tx pgx.Tx, shipmentID, batchID string, ids []int64) error {
	if _, err := tx.Exec(ctx, `UPDATE units SET status = 'in_transit', shipment_id = $2 WHERE id = ANY($1)`, ids, shipmentID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO shipment_units (shipment_id, unit_id) SELECT $1, unnest($2::bigint[])`, shipmentID, ids); err != nil {
		return err
	}
	_, err := tx.Exec(ctx, `INSERT INTO shipment_lines (shipment_id, batch_id, quantity) VALUES ($1, $2, $3)`, shipmentID, batchID, len(ids))
	return err
}

// sendShipmentTx notifies the recipient and records the shipment in the audit log.
func (a *App) sendShipmentTx(ctx context.Context, tx pgx.Tx, actor *Actor, shipmentID, reference, toOrgID string) error {
	if err := a.notify(ctx, tx, notice{OrgID: toOrgID, Kind: "shipment_incoming",
		Title: "Incoming shipment " + reference, Body: "Check the packs on arrival, then receive or reject it.",
		Link: "/app/shipments/" + shipmentID}); err != nil {
		return err
	}
	return a.audit(ctx, tx, actor, "shipment.created", "shipment", shipmentID, map[string]any{"reference": reference, "to": toOrgID})
}

func (a *App) GetShipment(ctx context.Context, actor *Actor, id string) (*Shipment, error) {
	if actor == nil {
		return nil, ErrUnauthorized
	}
	if !IsUUID(id) {
		return nil, errNotFound("Shipment")
	}
	var s Shipment
	err := scanShipment(a.DB.QueryRow(ctx, shipmentSelect+` WHERE s.id = $1 AND ($2 OR s.from_org_id::text = $3 OR s.to_org_id::text = $3)`,
		id, actor.IsAdmin(), actor.OrgID), &s)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound("Shipment")
	}
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT b.id, b.batch_number, p.id, p.name, p.strength, p.dosage_form,
			to_char(b.expires_on, 'YYYY-MM-DD'), b.recalled_at IS NOT NULL, l.quantity
		FROM shipment_lines l JOIN batches b ON b.id = l.batch_id JOIN products p ON p.id = b.product_id
		WHERE l.shipment_id = $1 ORDER BY p.name, b.batch_number`, id)
	if err != nil {
		return nil, err
	}
	s.Lines, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (ShipmentLine, error) {
		var l ShipmentLine
		err := r.Scan(&l.BatchID, &l.BatchNumber, &l.ProductID, &l.ProductName, &l.Strength, &l.DosageForm,
			&l.ExpiresOn, &l.Recalled, &l.Quantity)
		return l, err
	})
	if err != nil {
		return nil, err
	}
	return &s, nil
}

type ShipmentFilter struct {
	PageParams
	Direction string // in | out | "" (both)
	Status    string
}

func (a *App) ListShipments(ctx context.Context, actor *Actor, f ShipmentFilter) (*Page[Shipment], error) {
	if err := requireRole(actor, RoleManufacturer, RoleImporter, RolePharmacy, RoleAdmin); err != nil {
		return nil, err
	}
	f.PageParams = f.normalized()
	where := ` WHERE ($1
			OR ($2 IN ('', 'in') AND s.to_org_id::text = $3)
			OR ($2 IN ('', 'out') AND s.from_org_id::text = $3))
		AND ($4 = '' OR s.status = $4)`
	args := []any{actor.IsAdmin(), f.Direction, actor.OrgID, f.Status}
	page := &Page[Shipment]{Items: []Shipment{}, Limit: f.Limit, Offset: f.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM shipments s`+where, args...).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, shipmentSelect+where+` ORDER BY s.created_at DESC LIMIT $5 OFFSET $6`,
		append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var s Shipment
		if err := scanShipment(rows, &s); err != nil {
			return nil, err
		}
		page.Items = append(page.Items, s)
	}
	return page, rows.Err()
}

// closeShipment handles receive / reject / cancel, which differ only in who may act and
// where the units end up.
func (a *App) closeShipment(ctx context.Context, actor *Actor, id, action, reason string) (*Shipment, error) {
	if err := requireActiveOrg(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("Shipment")
	}
	if action == "reject" && len(trim(reason)) < 3 {
		return nil, errInvalid(map[string]string{"reason": "Tell the sender why you're rejecting it."})
	}
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		var from, to, status, reference string
		err := tx.QueryRow(ctx, `SELECT from_org_id, to_org_id, status, reference FROM shipments WHERE id = $1 FOR UPDATE`, id).
			Scan(&from, &to, &status, &reference)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && actor.OrgID != from && actor.OrgID != to) {
			return errNotFound("Shipment")
		}
		if err != nil {
			return err
		}
		if action == "cancel" && actor.OrgID != from {
			return errForbidden("Only the sender can cancel a shipment.")
		}
		if action != "cancel" && actor.OrgID != to {
			return errForbidden("Only the recipient can " + action + " a shipment.")
		}
		if status != "in_transit" {
			return errConflict("This shipment is already " + status + ".")
		}

		var newStatus string
		var notifyOrg, title string
		switch action {
		case "receive":
			newStatus, notifyOrg, title = "received", from, "Shipment "+reference+" was received"
			_, err = tx.Exec(ctx, `UPDATE units SET status = 'in_stock', holder_id = $2, shipment_id = NULL WHERE shipment_id = $1`, id, to)
		case "reject":
			newStatus, notifyOrg, title = "rejected", from, "Shipment "+reference+" was rejected"
			_, err = tx.Exec(ctx, `UPDATE units SET status = 'in_stock', shipment_id = NULL WHERE shipment_id = $1`, id)
		case "cancel":
			newStatus, notifyOrg, title = "cancelled", to, "Shipment "+reference+" was cancelled by the sender"
			_, err = tx.Exec(ctx, `UPDATE units SET status = 'in_stock', shipment_id = NULL WHERE shipment_id = $1`, id)
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE shipments SET status = $2, rejection_reason = $3, closed_at = now(), closed_by = $4 WHERE id = $1`,
			id, newStatus, trim(reason), actor.UserID); err != nil {
			return err
		}
		// A purchase order fulfilled by this shipment follows its outcome.
		orderStatus := map[string]string{"received": "delivered", "rejected": "returned", "cancelled": "cancelled"}[newStatus]
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = $2, updated_at = now(), closed_at = now()
			WHERE shipment_id = $1 AND status = 'accepted'`, id, orderStatus); err != nil {
			return err
		}
		if err := a.notify(ctx, tx, notice{OrgID: notifyOrg, Kind: "shipment_" + newStatus, Title: title,
			Body: trim(reason), Link: "/app/shipments/" + id}); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "shipment."+newStatus, "shipment", id, map[string]any{"reference": reference, "reason": reason})
	})
	if err != nil {
		return nil, err
	}
	return a.GetShipment(ctx, actor, id)
}

func (a *App) ReceiveShipment(ctx context.Context, actor *Actor, id string) (*Shipment, error) {
	return a.closeShipment(ctx, actor, id, "receive", "")
}

func (a *App) RejectShipment(ctx context.Context, actor *Actor, id, reason string) (*Shipment, error) {
	return a.closeShipment(ctx, actor, id, "reject", reason)
}

func (a *App) CancelShipment(ctx context.Context, actor *Actor, id string) (*Shipment, error) {
	return a.closeShipment(ctx, actor, id, "cancel", "")
}
