package app

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type Product struct {
	ID                   string    `json:"id"`
	ManufacturerID       string    `json:"manufacturer_id"`
	ManufacturerName     string    `json:"manufacturer_name"`
	Name                 string    `json:"name"`
	GenericName          string    `json:"generic_name"`
	Strength             string    `json:"strength"`
	DosageForm           string    `json:"dosage_form"`
	Category             string    `json:"category"`
	PackSize             string    `json:"pack_size"`
	Description          string    `json:"description"`
	RequiresPrescription bool      `json:"requires_prescription"`
	Status               string    `json:"status"`
	StatusReason         string    `json:"status_reason"`
	BatchCount           int       `json:"batch_count"`
	UnitCount            int       `json:"unit_count"`
	CreatedAt            time.Time `json:"created_at"`
}

const productSelect = `SELECT p.id, p.manufacturer_id, o.name, p.name, p.generic_name, p.strength, p.dosage_form,
	p.category, p.pack_size, p.description, p.requires_prescription, p.status, p.status_reason,
	(SELECT count(*) FROM batches b WHERE b.product_id = p.id),
	(SELECT coalesce(sum(b.quantity), 0) FROM batches b WHERE b.product_id = p.id),
	p.created_at
	FROM products p JOIN organizations o ON o.id = p.manufacturer_id`

func scanProduct(row pgx.Row, p *Product) error {
	return row.Scan(&p.ID, &p.ManufacturerID, &p.ManufacturerName, &p.Name, &p.GenericName, &p.Strength,
		&p.DosageForm, &p.Category, &p.PackSize, &p.Description, &p.RequiresPrescription, &p.Status,
		&p.StatusReason, &p.BatchCount, &p.UnitCount, &p.CreatedAt)
}

type ProductInput struct {
	Name                 string `json:"name"`
	GenericName          string `json:"generic_name"`
	Strength             string `json:"strength"`
	DosageForm           string `json:"dosage_form"`
	Category             string `json:"category"`
	PackSize             string `json:"pack_size"`
	Description          string `json:"description"`
	RequiresPrescription bool   `json:"requires_prescription"`
}

func (in ProductInput) validate() error {
	v := Validator{}
	v.Required(in.Name, "name")
	v.Required(in.GenericName, "generic_name")
	v.Required(in.Strength, "strength")
	v.Required(in.DosageForm, "dosage_form")
	return v.Err()
}

func (a *App) CreateProduct(ctx context.Context, actor *Actor, in ProductInput) (*Product, error) {
	if err := requireActiveOrg(actor, RoleManufacturer); err != nil {
		return nil, err
	}
	if err := in.validate(); err != nil {
		return nil, err
	}
	var id string
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `INSERT INTO products (manufacturer_id, name, generic_name, strength, dosage_form,
			category, pack_size, description, requires_prescription)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
			actor.OrgID, trim(in.Name), trim(in.GenericName), trim(in.Strength), trim(in.DosageForm),
			trim(in.Category), trim(in.PackSize), trim(in.Description), in.RequiresPrescription).Scan(&id)
		if isUniqueViolation(err) {
			return errInvalid(map[string]string{"name": "You already registered this product with the same strength and form."})
		}
		if err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "product.created", "product", id, map[string]any{"name": in.Name})
	})
	if err != nil {
		return nil, err
	}
	return a.GetProduct(ctx, actor, id)
}

func (a *App) UpdateProduct(ctx context.Context, actor *Actor, id string, in ProductInput) (*Product, error) {
	if err := requireActiveOrg(actor, RoleManufacturer); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("Product")
	}
	if err := in.validate(); err != nil {
		return nil, err
	}
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE products SET name = $3, generic_name = $4, strength = $5, dosage_form = $6,
			category = $7, pack_size = $8, description = $9, requires_prescription = $10, updated_at = now()
			WHERE id = $1 AND manufacturer_id = $2`,
			id, actor.OrgID, trim(in.Name), trim(in.GenericName), trim(in.Strength), trim(in.DosageForm),
			trim(in.Category), trim(in.PackSize), trim(in.Description), in.RequiresPrescription)
		if isUniqueViolation(err) {
			return errInvalid(map[string]string{"name": "You already registered this product with the same strength and form."})
		}
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return errNotFound("Product")
		}
		return a.audit(ctx, tx, actor, "product.updated", "product", id, nil)
	})
	if err != nil {
		return nil, err
	}
	return a.GetProduct(ctx, actor, id)
}

// GetProduct returns a product; manufacturers only see their own, admins see all.
func (a *App) GetProduct(ctx context.Context, actor *Actor, id string) (*Product, error) {
	if !IsUUID(id) {
		return nil, errNotFound("Product")
	}
	var p Product
	err := scanProduct(a.DB.QueryRow(ctx, productSelect+` WHERE p.id = $1 AND ($2 OR p.manufacturer_id::text = $3)`,
		id, actor.IsAdmin(), actor.OrgID), &p)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound("Product")
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

type ProductFilter struct {
	PageParams
	Q              string
	Status         string
	ManufacturerID string
}

// ListProducts lists the manufacturer's own catalog, or every product for admins.
func (a *App) ListProducts(ctx context.Context, actor *Actor, f ProductFilter) (*Page[Product], error) {
	if err := requireRole(actor, RoleManufacturer, RoleAdmin); err != nil {
		return nil, err
	}
	f.PageParams = f.normalized()
	owner := actor.OrgID
	if actor.IsAdmin() {
		owner = f.ManufacturerID
	}
	where := ` WHERE ($1 = '' OR p.manufacturer_id::text = $1)
		AND ($2 = '' OR p.name ILIKE '%' || $2 || '%' OR p.generic_name ILIKE '%' || $2 || '%')
		AND ($3 = '' OR p.status = $3)`
	args := []any{owner, trim(f.Q), f.Status}

	page := &Page[Product]{Items: []Product{}, Limit: f.Limit, Offset: f.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM products p`+where, args...).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, productSelect+where+` ORDER BY p.name, p.strength LIMIT $4 OFFSET $5`,
		append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p Product
		if err := scanProduct(rows, &p); err != nil {
			return nil, err
		}
		page.Items = append(page.Items, p)
	}
	return page, rows.Err()
}

type StatusInput struct {
	Status string `json:"status"`
	Reason string `json:"reason"`
}

// SetProductStatus: manufacturers may discontinue/reactivate their own products;
// only admins may suspend (or lift a suspension).
func (a *App) SetProductStatus(ctx context.Context, actor *Actor, id string, in StatusInput) (*Product, error) {
	if !IsUUID(id) {
		return nil, errNotFound("Product")
	}
	if in.Status != "active" && in.Status != "suspended" && in.Status != "discontinued" {
		return nil, errInvalid(map[string]string{"status": "Unknown status."})
	}
	if actor.IsAdmin() {
		if in.Status == "suspended" && trim(in.Reason) == "" {
			return nil, errInvalid(map[string]string{"reason": "Give a reason for the suspension."})
		}
	} else if err := requireActiveOrg(actor, RoleManufacturer); err != nil {
		return nil, err
	} else if in.Status == "suspended" {
		return nil, errForbidden("Only an administrator can suspend a product.")
	}

	err := a.inTx(ctx, func(tx pgx.Tx) error {
		var current, owner, name string
		err := tx.QueryRow(ctx, `SELECT status, manufacturer_id, name FROM products WHERE id = $1 FOR UPDATE`, id).Scan(&current, &owner, &name)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && !actor.IsAdmin() && owner != actor.OrgID) {
			return errNotFound("Product")
		}
		if err != nil {
			return err
		}
		if current == "suspended" && !actor.IsAdmin() {
			return errForbidden("This product was suspended by an administrator.")
		}
		if _, err := tx.Exec(ctx, `UPDATE products SET status = $2, status_reason = $3, updated_at = now() WHERE id = $1`,
			id, in.Status, trim(in.Reason)); err != nil {
			return err
		}
		if actor.IsAdmin() && current != in.Status {
			if err := a.notify(ctx, tx, notice{OrgID: owner, Kind: "product_status",
				Title: name + " is now " + in.Status, Body: trim(in.Reason), Link: "/app/products/" + id}); err != nil {
				return err
			}
		}
		return a.audit(ctx, tx, actor, "product.status_changed", "product", id, map[string]any{"from": current, "to": in.Status, "reason": in.Reason})
	})
	if err != nil {
		return nil, err
	}
	return a.GetProduct(ctx, actor, id)
}
