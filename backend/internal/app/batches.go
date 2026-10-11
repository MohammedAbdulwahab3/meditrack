package app

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

const MaxBatchQuantity = 50000

type BatchProduct struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Strength   string `json:"strength"`
	DosageForm string `json:"dosage_form"`
}

type Batch struct {
	ID               string       `json:"id"`
	Product          BatchProduct `json:"product"`
	ManufacturerID   string       `json:"manufacturer_id"`
	ManufacturerName string       `json:"manufacturer_name"`
	BatchNumber      string       `json:"batch_number"`
	ManufacturedOn   string       `json:"manufactured_on"`
	ExpiresOn        string       `json:"expires_on"`
	Quantity         int          `json:"quantity"`
	RecalledAt       *time.Time   `json:"recalled_at"`
	RecallReason     string       `json:"recall_reason"`
	CreatedAt        time.Time    `json:"created_at"`
	Distribution     Distribution `json:"distribution"`
}

// Distribution says where the batch's units are right now.
type Distribution struct {
	WithManufacturer int `json:"with_manufacturer"`
	InTransit        int `json:"in_transit"`
	WithPartners     int `json:"with_partners"`
	Dispensed        int `json:"dispensed"`
}

type Holding struct {
	OrgID     string `json:"organization_id"`
	OrgName   string `json:"organization_name"`
	OrgType   string `json:"organization_type"`
	City      string `json:"city"`
	InStock   int    `json:"in_stock"`
	InTransit int    `json:"in_transit"`
}

type BatchDetail struct {
	Batch
	Holdings []Holding `json:"holdings"`
}

const batchSelect = `SELECT b.id, p.id, p.name, p.strength, p.dosage_form, b.manufacturer_id, o.name, b.batch_number,
	to_char(b.manufactured_on, 'YYYY-MM-DD'), to_char(b.expires_on, 'YYYY-MM-DD'), b.quantity, b.recalled_at,
	b.recall_reason, b.created_at,
	count(u.id) FILTER (WHERE u.holder_id = b.manufacturer_id AND u.status = 'in_stock'),
	count(u.id) FILTER (WHERE u.status = 'in_transit'),
	count(u.id) FILTER (WHERE u.holder_id <> b.manufacturer_id AND u.status = 'in_stock'),
	count(u.id) FILTER (WHERE u.status = 'dispensed')
	FROM batches b
	JOIN products p ON p.id = b.product_id
	JOIN organizations o ON o.id = b.manufacturer_id
	LEFT JOIN units u ON u.batch_id = b.id`

const batchGroupBy = ` GROUP BY b.id, p.id, o.name`

func scanBatch(row pgx.Row, b *Batch) error {
	return row.Scan(&b.ID, &b.Product.ID, &b.Product.Name, &b.Product.Strength, &b.Product.DosageForm,
		&b.ManufacturerID, &b.ManufacturerName, &b.BatchNumber, &b.ManufacturedOn, &b.ExpiresOn, &b.Quantity,
		&b.RecalledAt, &b.RecallReason, &b.CreatedAt, &b.Distribution.WithManufacturer, &b.Distribution.InTransit,
		&b.Distribution.WithPartners, &b.Distribution.Dispensed)
}

type BatchInput struct {
	ProductID      string `json:"product_id"`
	BatchNumber    string `json:"batch_number"`
	ManufacturedOn string `json:"manufactured_on"`
	ExpiresOn      string `json:"expires_on"`
	Quantity       int    `json:"quantity"`
}

// CreateBatch registers a production batch and mints one unique code per pack.
func (a *App) CreateBatch(ctx context.Context, actor *Actor, in BatchInput) (*BatchDetail, error) {
	if err := requireActiveOrg(actor, RoleManufacturer); err != nil {
		return nil, err
	}
	v := Validator{}
	v.Check(IsUUID(in.ProductID), "product_id", "Choose a product.")
	v.Required(in.BatchNumber, "batch_number")
	made, okMade := parseDate(in.ManufacturedOn)
	expires, okExp := parseDate(in.ExpiresOn)
	today := a.Now().Truncate(24 * time.Hour)
	v.Check(okMade, "manufactured_on", "Enter a valid date.")
	v.Check(okExp, "expires_on", "Enter a valid date.")
	if okMade {
		v.Check(!made.After(today), "manufactured_on", "Manufacturing date can't be in the future.")
	}
	if okMade && okExp {
		v.Check(expires.After(made), "expires_on", "Expiry must be after the manufacturing date.")
		v.Check(expires.After(today), "expires_on", "This batch would already be expired.")
	}
	v.Check(in.Quantity >= 1 && in.Quantity <= MaxBatchQuantity, "quantity",
		fmt.Sprintf("Quantity must be between 1 and %d packs.", MaxBatchQuantity))
	if err := v.Err(); err != nil {
		return nil, err
	}

	var batchID string
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		var status string
		err := tx.QueryRow(ctx, `SELECT status FROM products WHERE id = $1 AND manufacturer_id = $2`,
			in.ProductID, actor.OrgID).Scan(&status)
		if errors.Is(err, pgx.ErrNoRows) {
			return errInvalid(map[string]string{"product_id": "Choose one of your products."})
		}
		if err != nil {
			return err
		}
		if status != "active" {
			return errInvalid(map[string]string{"product_id": "This product is " + status + " and can't get new batches."})
		}

		err = tx.QueryRow(ctx, `INSERT INTO batches (product_id, manufacturer_id, batch_number, manufactured_on, expires_on, quantity, created_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
			in.ProductID, actor.OrgID, trim(in.BatchNumber), made, expires, in.Quantity, actor.UserID).Scan(&batchID)
		if isUniqueViolation(err) {
			return errInvalid(map[string]string{"batch_number": "You already used this batch number."})
		}
		if err != nil {
			return err
		}

		rows := make([][]any, in.Quantity)
		for i := range rows {
			code, err := newUnitCode()
			if err != nil {
				return err
			}
			rows[i] = []any{code, batchID, i + 1, "in_stock", actor.OrgID}
		}
		if _, err := tx.CopyFrom(ctx, pgx.Identifier{"units"},
			[]string{"code", "batch_id", "serial", "status", "holder_id"}, pgx.CopyFromRows(rows)); err != nil {
			return fmt.Errorf("mint unit codes: %w", err)
		}
		return a.audit(ctx, tx, actor, "batch.created", "batch", batchID,
			map[string]any{"batch_number": in.BatchNumber, "quantity": in.Quantity})
	})
	if err != nil {
		return nil, err
	}
	return a.GetBatch(ctx, actor, batchID)
}

func (a *App) GetBatch(ctx context.Context, actor *Actor, id string) (*BatchDetail, error) {
	if err := requireRole(actor, RoleManufacturer, RoleAdmin); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("Batch")
	}
	var d BatchDetail
	err := scanBatch(a.DB.QueryRow(ctx, batchSelect+` WHERE b.id = $1 AND ($2 OR b.manufacturer_id::text = $3)`+batchGroupBy,
		id, actor.IsAdmin(), actor.OrgID), &d.Batch)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound("Batch")
	}
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT o.id, o.name, o.type, o.city,
			count(*) FILTER (WHERE u.status = 'in_stock'), count(*) FILTER (WHERE u.status = 'in_transit')
		FROM units u JOIN organizations o ON o.id = u.holder_id
		WHERE u.batch_id = $1 AND u.status IN ('in_stock', 'in_transit')
		GROUP BY o.id ORDER BY count(*) DESC`, id)
	if err != nil {
		return nil, err
	}
	d.Holdings, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (Holding, error) {
		var h Holding
		err := r.Scan(&h.OrgID, &h.OrgName, &h.OrgType, &h.City, &h.InStock, &h.InTransit)
		return h, err
	})
	if err != nil {
		return nil, err
	}
	return &d, nil
}

type BatchFilter struct {
	PageParams
	ProductID string
	Q         string
	State     string // active | recalled | expired
}

func (a *App) ListBatches(ctx context.Context, actor *Actor, f BatchFilter) (*Page[Batch], error) {
	if err := requireRole(actor, RoleManufacturer, RoleAdmin); err != nil {
		return nil, err
	}
	f.PageParams = f.normalized()
	owner := ""
	if !actor.IsAdmin() {
		owner = actor.OrgID
	}
	where := ` WHERE ($1 = '' OR b.manufacturer_id::text = $1)
		AND ($2 = '' OR b.product_id::text = $2)
		AND ($3 = '' OR b.batch_number ILIKE '%' || $3 || '%' OR p.name ILIKE '%' || $3 || '%')
		AND ($4 = ''
			OR ($4 = 'recalled' AND b.recalled_at IS NOT NULL)
			OR ($4 = 'expired' AND b.recalled_at IS NULL AND b.expires_on <= current_date)
			OR ($4 = 'active' AND b.recalled_at IS NULL AND b.expires_on > current_date))`
	args := []any{owner, f.ProductID, trim(f.Q), f.State}
	page := &Page[Batch]{Items: []Batch{}, Limit: f.Limit, Offset: f.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM batches b JOIN products p ON p.id = b.product_id`+where, args...).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, batchSelect+where+batchGroupBy+` ORDER BY b.created_at DESC LIMIT $5 OFFSET $6`,
		append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var b Batch
		if err := scanBatch(rows, &b); err != nil {
			return nil, err
		}
		page.Items = append(page.Items, b)
	}
	return page, rows.Err()
}

type UnitLabel struct {
	Serial int    `json:"serial"`
	Code   string `json:"code"`
}

// BatchLabels returns unit codes for printing QR labels (owner manufacturer or admin).
func (a *App) BatchLabels(ctx context.Context, actor *Actor, batchID string, p PageParams) (*Page[UnitLabel], error) {
	if _, err := a.GetBatch(ctx, actor, batchID); err != nil {
		return nil, err
	}
	if p.Limit <= 0 || p.Limit > 1000 {
		p.Limit = 200
	}
	page := &Page[UnitLabel]{Items: []UnitLabel{}, Limit: p.Limit, Offset: p.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM units WHERE batch_id = $1`, batchID).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT serial, code FROM units WHERE batch_id = $1 ORDER BY serial LIMIT $2 OFFSET $3`,
		batchID, p.Limit, p.Offset)
	if err != nil {
		return nil, err
	}
	page.Items, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (UnitLabel, error) {
		var l UnitLabel
		err := r.Scan(&l.Serial, &l.Code)
		return l, err
	})
	return page, err
}

type RecallInput struct {
	Reason string `json:"reason"`
}

// RecallBatch marks a batch as recalled and alerts every organization still holding its packs.
func (a *App) RecallBatch(ctx context.Context, actor *Actor, id string, in RecallInput) (*BatchDetail, error) {
	if actor.IsAdmin() {
		// admins may recall any batch
	} else if err := requireActiveOrg(actor, RoleManufacturer); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("Batch")
	}
	if len(trim(in.Reason)) < 5 {
		return nil, errInvalid(map[string]string{"reason": "Describe why this batch is being recalled."})
	}
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		var owner, number, productName string
		var recalledAt *time.Time
		err := tx.QueryRow(ctx, `SELECT b.manufacturer_id, b.batch_number, p.name, b.recalled_at
			FROM batches b JOIN products p ON p.id = b.product_id WHERE b.id = $1 FOR UPDATE OF b`, id).
			Scan(&owner, &number, &productName, &recalledAt)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !actor.IsAdmin() && owner != actor.OrgID) {
			return errNotFound("Batch")
		}
		if err != nil {
			return err
		}
		if recalledAt != nil {
			return errConflict("This batch is already recalled.")
		}
		if _, err := tx.Exec(ctx, `UPDATE batches SET recalled_at = now(), recall_reason = $2 WHERE id = $1`, id, trim(in.Reason)); err != nil {
			return err
		}

		title := fmt.Sprintf("Recall: %s batch %s", productName, number)
		rows, err := tx.Query(ctx, `SELECT DISTINCT holder_id FROM units
			WHERE batch_id = $1 AND status IN ('in_stock', 'in_transit') AND holder_id <> $2
			UNION SELECT DISTINCT s.to_org_id FROM units u JOIN shipments s ON s.id = u.shipment_id
			WHERE u.batch_id = $1 AND u.status = 'in_transit'`, id, owner)
		if err != nil {
			return err
		}
		holders, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		for _, orgID := range holders {
			if err := a.notify(ctx, tx, notice{OrgID: orgID, Kind: "recall", Title: title,
				Body: "Stop selling and quarantine these packs. Reason: " + trim(in.Reason), Link: "/app/inventory?recalled=1"}); err != nil {
				return err
			}
		}
		if actor.IsAdmin() {
			err = a.notify(ctx, tx, notice{OrgID: owner, Kind: "recall", Title: title + " (by administrator)",
				Body: trim(in.Reason), Link: "/app/batches/" + id})
		} else {
			err = a.notify(ctx, tx, notice{ForAdmins: true, Kind: "recall", Title: title, Body: trim(in.Reason), Link: "/app/admin/batches"})
		}
		if err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "batch.recalled", "batch", id, map[string]any{"reason": in.Reason, "notified": len(holders)})
	})
	if err != nil {
		return nil, err
	}
	return a.GetBatch(ctx, actor, id)
}
