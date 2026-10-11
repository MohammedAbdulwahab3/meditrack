package app

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

// ExpiringSoonDays is the window in which stock is flagged as expiring.
const ExpiringSoonDays = 90

type StockBatch struct {
	BatchID      string `json:"batch_id"`
	BatchNumber  string `json:"batch_number"`
	ExpiresOn    string `json:"expires_on"`
	DaysToExpiry int    `json:"days_to_expiry"`
	Expired      bool   `json:"expired"`
	ExpiringSoon bool   `json:"expiring_soon"`
	Recalled     bool   `json:"recalled"`
	RecallReason string `json:"recall_reason"`
	InStock      int    `json:"in_stock"`
	InTransitOut int    `json:"in_transit_out"`
}

type StockProduct struct {
	ProductID        string       `json:"product_id"`
	Name             string       `json:"name"`
	Strength         string       `json:"strength"`
	DosageForm       string       `json:"dosage_form"`
	ManufacturerName string       `json:"manufacturer_name"`
	InStock          int          `json:"in_stock"`
	Sellable         int          `json:"sellable"` // in stock, not expired, not recalled
	MinQuantity      *int         `json:"min_quantity"`
	LowStock         bool         `json:"low_stock"`
	Batches          []StockBatch `json:"batches"`
}

type InventorySummary struct {
	TotalUnits   int `json:"total_units"`
	Products     int `json:"products"`
	LowStock     int `json:"low_stock"`
	ExpiringSoon int `json:"expiring_soon"`
	Expired      int `json:"expired"`
	Recalled     int `json:"recalled"`
	InTransitOut int `json:"in_transit_out"`
}

type Inventory struct {
	Summary  InventorySummary `json:"summary"`
	Products []StockProduct   `json:"products"`
}

func (a *App) GetInventory(ctx context.Context, actor *Actor) (*Inventory, error) {
	if err := requireRole(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `
		SELECT p.id, p.name, p.strength, p.dosage_form, mo.name,
			b.id, b.batch_number, b.expires_on, b.recalled_at IS NOT NULL, b.recall_reason,
			count(*) FILTER (WHERE u.status = 'in_stock'), count(*) FILTER (WHERE u.status = 'in_transit')
		FROM units u
		JOIN batches b ON b.id = u.batch_id
		JOIN products p ON p.id = b.product_id
		JOIN organizations mo ON mo.id = p.manufacturer_id
		WHERE u.holder_id = $1 AND u.status IN ('in_stock', 'in_transit')
		GROUP BY p.id, mo.name, b.id
		ORDER BY p.name, p.strength, b.expires_on`, actor.OrgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	today := a.Now().Truncate(24 * time.Hour)
	byID := map[string]*StockProduct{}
	var order []string
	for rows.Next() {
		var sp StockProduct
		var sb StockBatch
		var expires time.Time
		if err := rows.Scan(&sp.ProductID, &sp.Name, &sp.Strength, &sp.DosageForm, &sp.ManufacturerName,
			&sb.BatchID, &sb.BatchNumber, &expires, &sb.Recalled, &sb.RecallReason, &sb.InStock, &sb.InTransitOut); err != nil {
			return nil, err
		}
		sb.ExpiresOn = expires.Format("2006-01-02")
		sb.DaysToExpiry = int(expires.Sub(today).Hours() / 24)
		sb.Expired = sb.DaysToExpiry <= 0
		sb.ExpiringSoon = !sb.Expired && sb.DaysToExpiry <= ExpiringSoonDays

		p, ok := byID[sp.ProductID]
		if !ok {
			sp.Batches = []StockBatch{}
			p = &sp
			byID[sp.ProductID] = p
			order = append(order, sp.ProductID)
		}
		p.Batches = append(p.Batches, sb)
		p.InStock += sb.InStock
		if !sb.Expired && !sb.Recalled {
			p.Sellable += sb.InStock
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Thresholds — including products we've run out of completely.
	trows, err := a.DB.Query(ctx, `SELECT t.product_id, t.min_quantity, p.name, p.strength, p.dosage_form, mo.name
		FROM stock_thresholds t JOIN products p ON p.id = t.product_id JOIN organizations mo ON mo.id = p.manufacturer_id
		WHERE t.organization_id = $1`, actor.OrgID)
	if err != nil {
		return nil, err
	}
	defer trows.Close()
	for trows.Next() {
		var sp StockProduct
		var min int
		if err := trows.Scan(&sp.ProductID, &min, &sp.Name, &sp.Strength, &sp.DosageForm, &sp.ManufacturerName); err != nil {
			return nil, err
		}
		p, ok := byID[sp.ProductID]
		if !ok {
			sp.Batches = []StockBatch{}
			p = &sp
			byID[sp.ProductID] = p
			order = append(order, sp.ProductID)
		}
		p.MinQuantity = &min
		p.LowStock = p.Sellable < min
	}
	if err := trows.Err(); err != nil {
		return nil, err
	}

	inv := &Inventory{Products: make([]StockProduct, 0, len(order))}
	for _, id := range order {
		p := byID[id]
		inv.Products = append(inv.Products, *p)
		inv.Summary.TotalUnits += p.InStock
		if p.LowStock {
			inv.Summary.LowStock++
		}
		for _, b := range p.Batches {
			inv.Summary.InTransitOut += b.InTransitOut
			if b.InStock == 0 {
				continue
			}
			switch {
			case b.Recalled:
				inv.Summary.Recalled += b.InStock
			case b.Expired:
				inv.Summary.Expired += b.InStock
			case b.ExpiringSoon:
				inv.Summary.ExpiringSoon += b.InStock
			}
		}
	}
	sort.SliceStable(inv.Products, func(i, j int) bool { return inv.Products[i].Name < inv.Products[j].Name })
	inv.Summary.Products = len(inv.Products)
	return inv, nil
}

type ThresholdInput struct {
	MinQuantity *int `json:"min_quantity"` // nil removes the threshold
}

func (a *App) SetThreshold(ctx context.Context, actor *Actor, productID string, in ThresholdInput) error {
	if err := requireActiveOrg(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return err
	}
	if !IsUUID(productID) {
		return errNotFound("Product")
	}
	if in.MinQuantity == nil {
		_, err := a.DB.Exec(ctx, `DELETE FROM stock_thresholds WHERE organization_id = $1 AND product_id = $2`, actor.OrgID, productID)
		return err
	}
	if *in.MinQuantity < 0 || *in.MinQuantity > 1_000_000 {
		return errInvalid(map[string]string{"min_quantity": "Enter a number between 0 and 1,000,000."})
	}
	var exists bool
	if err := a.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM products WHERE id = $1)`, productID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return errNotFound("Product")
	}
	_, err := a.DB.Exec(ctx, `INSERT INTO stock_thresholds (organization_id, product_id, min_quantity) VALUES ($1, $2, $3)
		ON CONFLICT (organization_id, product_id) DO UPDATE SET min_quantity = EXCLUDED.min_quantity`,
		actor.OrgID, productID, *in.MinQuantity)
	return err
}

// ---- Dispensing (pharmacies only) ----

type DispenseInput struct {
	Codes     []string `json:"codes"`      // scan mode: specific packs
	ProductID string   `json:"product_id"` // quantity mode: first-expiry-first-out
	Quantity  int      `json:"quantity"`
}

type DispenseResult struct {
	Code        string `json:"code"`
	OK          bool   `json:"ok"`
	Message     string `json:"message"`
	ProductName string `json:"product_name,omitempty"`
	BatchNumber string `json:"batch_number,omitempty"`
}

type DispenseOutcome struct {
	Dispensed int              `json:"dispensed"`
	Results   []DispenseResult `json:"results"`
}

func (a *App) Dispense(ctx context.Context, actor *Actor, in DispenseInput) (*DispenseOutcome, error) {
	if err := requireActiveOrg(actor, RolePharmacy); err != nil {
		return nil, err
	}
	scanMode := len(in.Codes) > 0
	if scanMode && len(in.Codes) > 200 {
		return nil, errInvalid(map[string]string{"codes": "Dispense at most 200 packs at once."})
	}
	if !scanMode {
		v := Validator{}
		v.Check(IsUUID(in.ProductID), "product_id", "Choose a product.")
		v.Check(in.Quantity > 0 && in.Quantity <= 1000, "quantity", "Enter a quantity between 1 and 1000.")
		if err := v.Err(); err != nil {
			return nil, err
		}
	}

	out := &DispenseOutcome{Results: []DispenseResult{}}
	touched := map[string]bool{} // products whose stock changed
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		var ids []int64
		if scanMode {
			if err := lockSeller(ctx, tx, actor.OrgID); err != nil {
				return err
			}
			free := map[string]int{} // per product: packs not promised to confirmed customer orders
			seen := map[string]bool{}
			for _, raw := range in.Codes {
				code := NormalizeCode(raw)
				res := DispenseResult{Code: FormatCode(code)}
				if seen[code] {
					continue
				}
				seen[code] = true
				var id int64
				var holder *string
				var status, productID, productName, batchNumber string
				var recalled, expired bool
				err := tx.QueryRow(ctx, `SELECT u.id, u.holder_id, u.status, p.id, p.name || ' ' || p.strength, b.batch_number,
						b.recalled_at IS NOT NULL, b.expires_on <= current_date
					FROM units u JOIN batches b ON b.id = u.batch_id JOIN products p ON p.id = b.product_id
					WHERE u.code = $1 FOR UPDATE OF u`, code).
					Scan(&id, &holder, &status, &productID, &productName, &batchNumber, &recalled, &expired)
				res.ProductName, res.BatchNumber = productName, batchNumber
				switch {
				case errors.Is(err, pgx.ErrNoRows):
					res.Message = "Unknown code — this pack is not registered. Do not sell it."
				case err != nil:
					return err
				case status == "dispensed":
					res.Message = "Already dispensed. A second sale of the same code suggests a copied label."
				case holder == nil || *holder != actor.OrgID || status != "in_stock":
					res.Message = "This pack isn't in your stock. Receive its shipment first."
				case recalled:
					res.Message = "Recalled batch — quarantine this pack."
				case expired:
					res.Message = "Expired — do not sell."
				default:
					if _, ok := free[productID]; !ok {
						n, err := available(ctx, tx, actor.OrgID, productID, "")
						if err != nil {
							return err
						}
						free[productID] = n
					}
					if free[productID] <= 0 {
						res.Message = "All remaining stock of this medicine is held for confirmed customer orders. Complete or cancel those first."
						break
					}
					free[productID]--
					res.OK, res.Message = true, "Dispensed."
					ids = append(ids, id)
					touched[productID] = true
				}
				out.Results = append(out.Results, res)
			}
		} else {
			if err := lockSeller(ctx, tx, actor.OrgID); err != nil {
				return err
			}
			avail, err := available(ctx, tx, actor.OrgID, in.ProductID, "")
			if err != nil {
				return err
			}
			if avail < in.Quantity {
				return errInvalid(map[string]string{"quantity": fmt.Sprintf(
					"Only %d packs can be sold; the rest is held for confirmed customer orders.", max(avail, 0))})
			}
			rows, err := tx.Query(ctx, `SELECT u.id, u.code, b.batch_number, p.name || ' ' || p.strength
				FROM units u JOIN batches b ON b.id = u.batch_id JOIN products p ON p.id = b.product_id
				WHERE u.holder_id = $1 AND u.status = 'in_stock' AND b.product_id = $2
				  AND b.recalled_at IS NULL AND b.expires_on > current_date
				ORDER BY b.expires_on, u.serial LIMIT $3 FOR UPDATE OF u`, actor.OrgID, in.ProductID, in.Quantity)
			if err != nil {
				return err
			}
			for rows.Next() {
				var id int64
				var res DispenseResult
				if err := rows.Scan(&id, &res.Code, &res.BatchNumber, &res.ProductName); err != nil {
					rows.Close()
					return err
				}
				res.Code, res.OK, res.Message = FormatCode(res.Code), true, "Dispensed."
				ids = append(ids, id)
				out.Results = append(out.Results, res)
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return err
			}
			if len(ids) < in.Quantity {
				return errInvalid(map[string]string{"quantity": fmt.Sprintf("Only %d sellable packs in stock.", len(ids))})
			}
			touched[in.ProductID] = true
		}

		if len(ids) == 0 {
			return nil
		}
		before, err := sellableCounts(ctx, tx, actor.OrgID, touched)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE units SET status = 'dispensed', holder_id = NULL, dispensed_at = now(), dispensed_by_org = $2
			WHERE id = ANY($1)`, ids, actor.OrgID); err != nil {
			return err
		}
		out.Dispensed = len(ids)
		if err := a.lowStockAlertsTx(ctx, tx, actor.OrgID, before); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "units.dispensed", "organization", actor.OrgID, map[string]any{"count": len(ids)})
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

// sellableCounts snapshots sellable stock for the given products, for lowStockAlertsTx.
func sellableCounts(ctx context.Context, q querier, orgID string, products map[string]bool) (map[string]int, error) {
	out := map[string]int{}
	for pid := range products {
		n, err := sellableCount(ctx, q, orgID, pid)
		if err != nil {
			return nil, err
		}
		out[pid] = n
	}
	return out, nil
}

// lowStockAlertsTx notifies the organization for each product whose sellable stock just
// dropped below its reorder level (alerts fire only on the crossing, not repeatedly).
func (a *App) lowStockAlertsTx(ctx context.Context, tx pgx.Tx, orgID string, before map[string]int) error {
	for pid, was := range before {
		var min int
		var name string
		err := tx.QueryRow(ctx, `SELECT t.min_quantity, p.name FROM stock_thresholds t JOIN products p ON p.id = t.product_id
			WHERE t.organization_id = $1 AND t.product_id = $2`, orgID, pid).Scan(&min, &name)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		after, err := sellableCount(ctx, tx, orgID, pid)
		if err != nil {
			return err
		}
		if was >= min && after < min {
			if err := a.notify(ctx, tx, notice{OrgID: orgID, Kind: "low_stock",
				Title: fmt.Sprintf("Low stock: %s", name), Body: fmt.Sprintf("%d sellable packs left (minimum %d).", after, min),
				Link: "/app/inventory"}); err != nil {
				return err
			}
		}
	}
	return nil
}

func sellableCount(ctx context.Context, q querier, orgID, productID string) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT count(*) FROM units u JOIN batches b ON b.id = u.batch_id
		WHERE u.holder_id = $1 AND u.status = 'in_stock' AND b.product_id = $2
		  AND b.recalled_at IS NULL AND b.expires_on > current_date`, orgID, productID).Scan(&n)
	return n, err
}

type DispensedUnit struct {
	Code        string    `json:"code"`
	ProductName string    `json:"product_name"`
	BatchNumber string    `json:"batch_number"`
	DispensedAt time.Time `json:"dispensed_at"`
}

func (a *App) ListDispensed(ctx context.Context, actor *Actor, p PageParams) (*Page[DispensedUnit], error) {
	if err := requireRole(actor, RolePharmacy); err != nil {
		return nil, err
	}
	p = p.normalized()
	page := &Page[DispensedUnit]{Items: []DispensedUnit{}, Limit: p.Limit, Offset: p.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM units WHERE dispensed_by_org = $1 AND status = 'dispensed'`, actor.OrgID).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT u.code, p.name || ' ' || p.strength, b.batch_number, u.dispensed_at
		FROM units u JOIN batches b ON b.id = u.batch_id JOIN products p ON p.id = b.product_id
		WHERE u.dispensed_by_org = $1 AND u.status = 'dispensed'
		ORDER BY u.dispensed_at DESC, u.id DESC LIMIT $2 OFFSET $3`, actor.OrgID, p.Limit, p.Offset)
	if err != nil {
		return nil, err
	}
	page.Items, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (DispensedUnit, error) {
		var d DispensedUnit
		err := r.Scan(&d.Code, &d.ProductName, &d.BatchNumber, &d.DispensedAt)
		d.Code = FormatCode(d.Code)
		return d, err
	})
	return page, err
}
