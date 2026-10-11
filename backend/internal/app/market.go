package app

import (
	"context"
	"math"
	"strings"

	"github.com/jackc/pgx/v5"
)

// ---- Seller listings (prices) ----

type Listing struct {
	ProductID            string   `json:"product_id"`
	Name                 string   `json:"name"`
	GenericName          string   `json:"generic_name"`
	Strength             string   `json:"strength"`
	DosageForm           string   `json:"dosage_form"`
	ManufacturerName     string   `json:"manufacturer_name"`
	RequiresPrescription bool     `json:"requires_prescription"`
	ProductStatus        string   `json:"product_status"`
	UnitPrice            *float64 `json:"unit_price"`
	Currency             string   `json:"currency"`
	Listed               bool     `json:"listed"`
	Sellable             int      `json:"sellable"`
	Reserved             int      `json:"reserved"`
}

// sellerTypes is who each marketplace side buys from.
var sellerTypes = map[string][]string{
	"retail": {RolePharmacy},
	"supply": {RoleManufacturer, RoleImporter},
}

// MyListings lists every product the organization could sell: what it holds, what it makes,
// and anything it has priced before.
func (a *App) MyListings(ctx context.Context, actor *Actor) ([]Listing, error) {
	if err := requireRole(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `
		WITH candidates AS (
			SELECT DISTINCT b.product_id FROM units u JOIN batches b ON b.id = u.batch_id
			WHERE u.holder_id = $1 AND u.status = 'in_stock'
			UNION SELECT id FROM products WHERE manufacturer_id = $1
			UNION SELECT product_id FROM listings WHERE organization_id = $1
		)
		SELECT p.id, p.name, p.generic_name, p.strength, p.dosage_form, m.name, p.requires_prescription, p.status,
			l.unit_price::float8, coalesce(l.currency, 'ETB'), coalesce(l.is_listed, false),
			(SELECT count(*) FROM units u JOIN batches b ON b.id = u.batch_id
			 WHERE u.holder_id = $1 AND u.status = 'in_stock' AND b.product_id = p.id
			   AND b.recalled_at IS NULL AND b.expires_on > current_date),
			(SELECT coalesce(sum(oi.quantity), 0) FROM orders o JOIN order_items oi ON oi.order_id = o.id
			 WHERE o.seller_org_id = $1 AND o.kind = 'retail' AND o.status = 'confirmed' AND oi.product_id = p.id)
		FROM candidates c
		JOIN products p ON p.id = c.product_id
		JOIN organizations m ON m.id = p.manufacturer_id
		LEFT JOIN listings l ON l.organization_id = $1 AND l.product_id = p.id
		ORDER BY p.name, p.strength`, actor.OrgID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Listing, error) {
		var l Listing
		err := r.Scan(&l.ProductID, &l.Name, &l.GenericName, &l.Strength, &l.DosageForm, &l.ManufacturerName,
			&l.RequiresPrescription, &l.ProductStatus, &l.UnitPrice, &l.Currency, &l.Listed, &l.Sellable, &l.Reserved)
		return l, err
	})
}

type ListingInput struct {
	UnitPrice float64 `json:"unit_price"`
	Listed    bool    `json:"listed"`
}

func (a *App) SetListing(ctx context.Context, actor *Actor, productID string, in ListingInput) error {
	if err := requireActiveOrg(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return err
	}
	if !IsUUID(productID) {
		return errNotFound("Product")
	}
	price := math.Round(in.UnitPrice*100) / 100
	if price <= 0 || price > 10_000_000 {
		return errInvalid(map[string]string{"unit_price": "Enter a price greater than 0."})
	}
	return a.inTx(ctx, func(tx pgx.Tx) error {
		var ok bool
		err := tx.QueryRow(ctx, `SELECT EXISTS (
				SELECT 1 FROM products WHERE id = $2 AND manufacturer_id = $1
				UNION ALL
				SELECT 1 FROM units u JOIN batches b ON b.id = u.batch_id
				WHERE u.holder_id = $1 AND b.product_id = $2 AND u.status IN ('in_stock', 'in_transit')
				UNION ALL
				SELECT 1 FROM listings WHERE organization_id = $1 AND product_id = $2)`, actor.OrgID, productID).Scan(&ok)
		if err != nil {
			return err
		}
		if !ok {
			return errForbidden("You can only price products you make or hold in stock.")
		}
		if _, err := tx.Exec(ctx, `INSERT INTO listings (organization_id, product_id, unit_price, is_listed)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (organization_id, product_id) DO UPDATE SET unit_price = EXCLUDED.unit_price,
				is_listed = EXCLUDED.is_listed, updated_at = now()`, actor.OrgID, productID, price, in.Listed); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "listing.updated", "product", productID, map[string]any{"unit_price": price, "listed": in.Listed})
	})
}

// ---- Offers (what buyers browse) ----

type OfferSeller struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	Type      string   `json:"type"`
	City      string   `json:"city"`
	Address   string   `json:"address"`
	Phone     string   `json:"phone"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

type OfferProduct struct {
	ID                   string `json:"id"`
	Name                 string `json:"name"`
	GenericName          string `json:"generic_name"`
	Strength             string `json:"strength"`
	DosageForm           string `json:"dosage_form"`
	PackSize             string `json:"pack_size"`
	Category             string `json:"category"`
	RequiresPrescription bool   `json:"requires_prescription"`
	ManufacturerName     string `json:"manufacturer_name"`
}

type Offer struct {
	Seller         OfferSeller  `json:"seller"`
	Product        OfferProduct `json:"product"`
	UnitPrice      float64      `json:"unit_price"`
	Currency       string       `json:"currency"`
	Available      int          `json:"available"`
	EarliestExpiry string       `json:"earliest_expiry"`
	DistanceKm     *float64     `json:"distance_km"`
}

type OfferFilter struct {
	Side      string // retail (patients ← pharmacies) | supply (pharmacies ← manufacturers/importers)
	Q         string
	City      string
	ProductID string
	SellerID  string
	Near      *Point // when set, results include distance and nearest sellers come first
}

type Point struct{ Lat, Lng float64 }

func (p *Point) args() (any, any) {
	if p == nil {
		return nil, nil
	}
	return p.Lat, p.Lng
}

// Offers lists priced, listed, in-stock products. Only genuine stock counts: packs that are
// in date, not recalled, and (for pharmacies) not already held for a confirmed customer order.
// Retail offers are public; supply offers are for approved pharmacies.
func (a *App) Offers(ctx context.Context, actor *Actor, f OfferFilter) ([]Offer, error) {
	types, ok := sellerTypes[f.Side]
	if !ok {
		return nil, errBadRequest("side must be retail or supply")
	}
	if f.Side == "supply" {
		if err := requireActiveOrg(actor, RolePharmacy); err != nil {
			return nil, err
		}
	}
	if (f.ProductID != "" && !IsUUID(f.ProductID)) || (f.SellerID != "" && !IsUUID(f.SellerID)) {
		return []Offer{}, nil
	}
	nearLat, nearLng := f.Near.args()
	rows, err := a.DB.Query(ctx, `
		WITH `+stockCTEs+`
		SELECT s.id, s.name, s.type, s.city, s.address, s.phone, s.latitude, s.longitude,
			p.id, p.name, p.generic_name, p.strength, p.dosage_form, p.pack_size, p.category, p.requires_prescription, m.name,
			l.unit_price::float8, l.currency, (st.qty - coalesce(r.qty, 0))::int, to_char(st.earliest, 'YYYY-MM-DD'),
			distance_km($6::float8, $7::float8, s.latitude, s.longitude) AS dist
		FROM listings l
		JOIN organizations s ON s.id = l.organization_id
		JOIN products p ON p.id = l.product_id
		JOIN organizations m ON m.id = p.manufacturer_id
		JOIN stock st ON st.org_id = l.organization_id AND st.product_id = l.product_id
		LEFT JOIN reserved r ON r.org_id = l.organization_id AND r.product_id = l.product_id
		WHERE l.is_listed AND s.status = 'active' AND s.type = ANY($1) AND p.status = 'active'
		  AND st.qty - coalesce(r.qty, 0) > 0
		  AND ($2 = '' OR p.name ILIKE '%' || $2 || '%' OR p.generic_name ILIKE '%' || $2 || '%' OR p.category ILIKE '%' || $2 || '%')
		  AND ($3 = '' OR s.city ILIKE '%' || $3 || '%')
		  AND ($4 = '' OR p.id::text = $4)
		  AND ($5 = '' OR s.id::text = $5)
		ORDER BY dist NULLS LAST, p.name, p.strength, l.unit_price, s.name
		LIMIT 200`, types, strings.TrimSpace(f.Q), strings.TrimSpace(f.City), f.ProductID, f.SellerID, nearLat, nearLng)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Offer, error) {
		var o Offer
		err := r.Scan(&o.Seller.ID, &o.Seller.Name, &o.Seller.Type, &o.Seller.City, &o.Seller.Address, &o.Seller.Phone,
			&o.Seller.Latitude, &o.Seller.Longitude,
			&o.Product.ID, &o.Product.Name, &o.Product.GenericName, &o.Product.Strength, &o.Product.DosageForm,
			&o.Product.PackSize, &o.Product.Category, &o.Product.RequiresPrescription, &o.Product.ManufacturerName,
			&o.UnitPrice, &o.Currency, &o.Available, &o.EarliestExpiry, &o.DistanceKm)
		return o, err
	})
}

// stockCTEs defines `stock` (genuine sellable packs per holder and product) and `reserved`
// (packs promised to confirmed customer orders).
const stockCTEs = `stock AS (
			SELECT u.holder_id AS org_id, b.product_id, count(*) AS qty, min(b.expires_on) AS earliest
			FROM units u JOIN batches b ON b.id = u.batch_id
			WHERE u.status = 'in_stock' AND b.recalled_at IS NULL AND b.expires_on > current_date
			GROUP BY 1, 2
		), reserved AS (
			SELECT o.seller_org_id AS org_id, oi.product_id, sum(oi.quantity) AS qty
			FROM orders o JOIN order_items oi ON oi.order_id = o.id
			WHERE o.kind = 'retail' AND o.status = 'confirmed'
			GROUP BY 1, 2
		)`

// ---- Nearby pharmacies ----

type PharmacySummary struct {
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	City            string   `json:"city"`
	Address         string   `json:"address"`
	Phone           string   `json:"phone"`
	Latitude        *float64 `json:"latitude"`
	Longitude       *float64 `json:"longitude"`
	DistanceKm      *float64 `json:"distance_km"`
	ProductsInStock int      `json:"products_in_stock"`
}

// NearbyPharmacies lists approved pharmacies, nearest first when a point is given, with how
// many listed medicines each has in stock. Public.
func (a *App) NearbyPharmacies(ctx context.Context, near *Point, q string) ([]PharmacySummary, error) {
	nearLat, nearLng := near.args()
	rows, err := a.DB.Query(ctx, `
		WITH `+stockCTEs+`, offered AS (
			SELECT l.organization_id AS org_id, count(*) AS products
			FROM listings l
			JOIN products p ON p.id = l.product_id AND p.status = 'active'
			JOIN stock st ON st.org_id = l.organization_id AND st.product_id = l.product_id
			LEFT JOIN reserved r ON r.org_id = l.organization_id AND r.product_id = l.product_id
			WHERE l.is_listed AND st.qty - coalesce(r.qty, 0) > 0
			GROUP BY 1
		)
		SELECT o.id, o.name, o.city, o.address, o.phone, o.latitude, o.longitude,
			distance_km($1::float8, $2::float8, o.latitude, o.longitude) AS dist,
			coalesce(off.products, 0)::int
		FROM organizations o
		LEFT JOIN offered off ON off.org_id = o.id
		WHERE o.type = 'pharmacy' AND o.status = 'active'
		  AND ($3 = '' OR o.name ILIKE '%' || $3 || '%' OR o.city ILIKE '%' || $3 || '%' OR o.address ILIKE '%' || $3 || '%')
		ORDER BY dist NULLS LAST, coalesce(off.products, 0) DESC, o.name
		LIMIT 100`, nearLat, nearLng, strings.TrimSpace(q))
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (PharmacySummary, error) {
		var p PharmacySummary
		err := r.Scan(&p.ID, &p.Name, &p.City, &p.Address, &p.Phone, &p.Latitude, &p.Longitude, &p.DistanceKm, &p.ProductsInStock)
		return p, err
	})
}

// reservedCount is stock a pharmacy has promised to confirmed customer orders.
func reservedCount(ctx context.Context, q querier, orgID, productID, exceptOrderID string) (int, error) {
	var n int
	err := q.QueryRow(ctx, `SELECT coalesce(sum(oi.quantity), 0) FROM orders o JOIN order_items oi ON oi.order_id = o.id
		WHERE o.seller_org_id = $1 AND o.kind = 'retail' AND o.status = 'confirmed' AND oi.product_id = $2
		  AND ($3 = '' OR o.id::text <> $3)`, orgID, productID, exceptOrderID).Scan(&n)
	return n, err
}
