package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// CloneThreshold: once a dispensed-or-not pack has been checked by this many *other* members of
// the public, we warn that its label may have been copied onto fake packs.
const CloneThreshold = 3

type VerifyProduct struct {
	Name                 string `json:"name"`
	GenericName          string `json:"generic_name"`
	Strength             string `json:"strength"`
	DosageForm           string `json:"dosage_form"`
	PackSize             string `json:"pack_size"`
	RequiresPrescription bool   `json:"requires_prescription"`
}

type VerifyOrg struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	City    string `json:"city"`
	Country string `json:"country"`
}

type JourneyStep struct {
	Kind string     `json:"kind"` // manufactured | shipped | received | returned | dispensed
	At   time.Time  `json:"at"`
	Org  VerifyOrg  `json:"org"`
	To   *VerifyOrg `json:"to,omitempty"`
}

type VerifyResult struct {
	Status    string `json:"status"` // genuine | warning | expired | recalled | suspended | not_found
	Headline  string `json:"headline"`
	Message   string `json:"message"`
	Code      string `json:"code"`
	Serial    int    `json:"serial,omitempty"`
	UnitState string `json:"unit_state,omitempty"` // in_stock | in_transit | dispensed

	Product        *VerifyProduct `json:"product,omitempty"`
	Manufacturer   *VerifyOrg     `json:"manufacturer,omitempty"`
	BatchNumber    string         `json:"batch_number,omitempty"`
	ManufacturedOn string         `json:"manufactured_on,omitempty"`
	ExpiresOn      string         `json:"expires_on,omitempty"`
	RecallReason   string         `json:"recall_reason,omitempty"`
	Holder         *VerifyOrg     `json:"current_holder,omitempty"`
	DispensedAt    *time.Time     `json:"dispensed_at,omitempty"`
	DispensedBy    *VerifyOrg     `json:"dispensed_by,omitempty"`

	PreviousChecks   int           `json:"previous_checks"`
	FirstCheckedAt   *time.Time    `json:"first_checked_at,omitempty"`
	DistinctCheckers int           `json:"distinct_checkers"`
	Journey          []JourneyStep `json:"journey,omitempty"`
}

type ScanContext struct {
	Actor     *Actor // nil for anonymous visitors
	ClientIP  string
	UserAgent string
}

func (a *App) fingerprint(sc ScanContext) string {
	if sc.Actor != nil {
		return "u:" + sc.Actor.UserID
	}
	mac := hmac.New(sha256.New, a.SecretKey)
	mac.Write([]byte(sc.ClientIP))
	return "ip:" + hex.EncodeToString(mac.Sum(nil))[:32]
}

// Verify checks a pack code, records the check, and returns what the public should see.
func (a *App) Verify(ctx context.Context, rawCode string, sc ScanContext) (*VerifyResult, error) {
	code := NormalizeCode(rawCode)
	res := &VerifyResult{Code: FormatCode(code), Journey: []JourneyStep{}}
	role := "public"
	var userID *string
	if sc.Actor != nil {
		role = sc.Actor.Role
		userID = &sc.Actor.UserID
	}
	isPublic := role == "public" || role == RolePatient
	fp := a.fingerprint(sc)
	ua := sc.UserAgent
	if len(ua) > 255 {
		ua = ua[:255]
	}

	var unitID int64
	var batchID, productStatus string
	var recalledAt *time.Time
	var expires, made time.Time
	var holderID, dispensedBy *string
	found := false
	if validCode(code) {
		res.Product, res.Manufacturer = &VerifyProduct{}, &VerifyOrg{}
		err := a.DB.QueryRow(ctx, `SELECT u.id, u.serial, u.status, u.holder_id, u.dispensed_at, u.dispensed_by_org,
				b.id, b.batch_number, b.manufactured_on, b.expires_on, b.recalled_at, b.recall_reason,
				p.name, p.generic_name, p.strength, p.dosage_form, p.pack_size, p.requires_prescription, p.status,
				m.name, m.type, m.city, m.country
			FROM units u JOIN batches b ON b.id = u.batch_id JOIN products p ON p.id = b.product_id
			JOIN organizations m ON m.id = b.manufacturer_id
			WHERE u.code = $1`, code).Scan(&unitID, &res.Serial, &res.UnitState, &holderID, &res.DispensedAt, &dispensedBy,
			&batchID, &res.BatchNumber, &made, &expires, &recalledAt, &res.RecallReason,
			&res.Product.Name, &res.Product.GenericName, &res.Product.Strength, &res.Product.DosageForm,
			&res.Product.PackSize, &res.Product.RequiresPrescription, &productStatus,
			&res.Manufacturer.Name, &res.Manufacturer.Type, &res.Manufacturer.City, &res.Manufacturer.Country)
		switch {
		case err == nil:
			found = true
		case !errors.Is(err, pgx.ErrNoRows):
			return nil, err
		}
	}

	if !found {
		res.Product, res.Manufacturer = nil, nil
		res.Status = "not_found"
		res.Headline = "Not registered"
		res.Message = "This code is not in MediTrack. The pack may be counterfeit — do not use it, and report where you got it."
		if _, err := a.DB.Exec(ctx, `INSERT INTO scans (code, result, user_id, scanner_role, fingerprint, user_agent)
			VALUES ($1, $2, $3, $4, $5, $6)`, code, res.Status, userID, role, fp, ua); err != nil {
			return nil, err
		}
		return res, nil
	}

	res.ManufacturedOn = made.Format("2006-01-02")
	res.ExpiresOn = expires.Format("2006-01-02")

	// History of public checks before this one.
	var seenBefore bool
	err := a.DB.QueryRow(ctx, `SELECT count(*), min(created_at),
			count(DISTINCT fingerprint) FILTER (WHERE fingerprint <> $2),
			count(*) FILTER (WHERE fingerprint = $2) > 0
		FROM scans WHERE unit_id = $1 AND scanner_role IN ('public', 'patient')`, unitID, fp).
		Scan(&res.PreviousChecks, &res.FirstCheckedAt, &res.DistinctCheckers, &seenBefore)
	if err != nil {
		return nil, err
	}

	if holderID != nil {
		res.Holder = &VerifyOrg{}
		if err := a.DB.QueryRow(ctx, `SELECT name, type, city, country FROM organizations WHERE id = $1`, *holderID).
			Scan(&res.Holder.Name, &res.Holder.Type, &res.Holder.City, &res.Holder.Country); err != nil {
			return nil, err
		}
	}
	if dispensedBy != nil {
		res.DispensedBy = &VerifyOrg{}
		if err := a.DB.QueryRow(ctx, `SELECT name, type, city, country FROM organizations WHERE id = $1`, *dispensedBy).
			Scan(&res.DispensedBy.Name, &res.DispensedBy.Type, &res.DispensedBy.City, &res.DispensedBy.Country); err != nil {
			return nil, err
		}
	}
	if res.Journey, err = a.journey(ctx, unitID, batchID, res); err != nil {
		return nil, err
	}

	today := a.Now().Truncate(24 * time.Hour)
	switch {
	case recalledAt != nil:
		res.Status, res.Headline = "recalled", "Recalled — do not use"
		res.Message = "The manufacturer has recalled this batch. Return it to the pharmacy."
	case productStatus == "suspended":
		res.Status, res.Headline = "suspended", "Product suspended"
		res.Message = "Sale of this product has been suspended by the platform administrator. Do not use it; ask your pharmacist."
	case !expires.After(today):
		res.Status, res.Headline = "expired", "Expired"
		res.Message = "This pack is past its expiry date. Do not use it."
	case isPublic && res.DistinctCheckers >= CloneThreshold:
		res.Status, res.Headline = "warning", "Genuine code — but checked many times"
		res.Message = "This code is real, but it has been checked by several different people. The label may have been copied onto fake packs. If you bought it sealed from a pharmacy, ask them to confirm, and report it if in doubt."
	default:
		res.Status, res.Headline = "genuine", "Genuine medicine"
		res.Message = "This pack is registered by its manufacturer and its supply chain is recorded in MediTrack."
		if res.PreviousChecks > 0 && res.FirstCheckedAt != nil {
			res.Message += " It has been checked before — if that wasn't you, be careful."
		}
	}

	err = a.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `INSERT INTO scans (code, unit_id, result, user_id, scanner_role, fingerprint, user_agent)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`, code, unitID, res.Status, userID, role, fp, ua); err != nil {
			return err
		}
		// Alert once: when a new checker is the one who pushes the code over the threshold.
		if res.Status == "warning" && res.DistinctCheckers == CloneThreshold && !seenBefore {
			title := "Possible copied label: " + res.Product.Name + " batch " + res.BatchNumber
			body := "Code " + res.Code + " has been checked by many different people."
			var manufacturerID string
			if err := tx.QueryRow(ctx, `SELECT manufacturer_id FROM batches WHERE id = $1`, batchID).Scan(&manufacturerID); err != nil {
				return err
			}
			if err := a.notify(ctx, tx, notice{OrgID: manufacturerID, Kind: "suspicious_scans", Title: title, Body: body, Link: "/app/batches/" + batchID}); err != nil {
				return err
			}
			return a.notify(ctx, tx, notice{ForAdmins: true, Kind: "suspicious_scans", Title: title, Body: body, Link: "/app/admin/batches"})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return res, nil
}

func (a *App) journey(ctx context.Context, unitID int64, batchID string, res *VerifyResult) ([]JourneyStep, error) {
	steps := []JourneyStep{}
	var made time.Time
	if err := a.DB.QueryRow(ctx, `SELECT created_at FROM batches WHERE id = $1`, batchID).Scan(&made); err != nil {
		return nil, err
	}
	steps = append(steps, JourneyStep{Kind: "manufactured", At: made, Org: *res.Manufacturer})

	rows, err := a.DB.Query(ctx, `SELECT s.status, s.created_at, s.closed_at,
			f.name, f.type, f.city, f.country, t.name, t.type, t.city, t.country
		FROM shipment_units su JOIN shipments s ON s.id = su.shipment_id
		JOIN organizations f ON f.id = s.from_org_id JOIN organizations t ON t.id = s.to_org_id
		WHERE su.unit_id = $1 AND s.status <> 'cancelled' ORDER BY s.created_at`, unitID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var created time.Time
		var closed *time.Time
		var from, to VerifyOrg
		if err := rows.Scan(&status, &created, &closed, &from.Name, &from.Type, &from.City, &from.Country,
			&to.Name, &to.Type, &to.City, &to.Country); err != nil {
			return nil, err
		}
		toCopy := to
		steps = append(steps, JourneyStep{Kind: "shipped", At: created, Org: from, To: &toCopy})
		if closed != nil {
			switch status {
			case "received":
				steps = append(steps, JourneyStep{Kind: "received", At: *closed, Org: to})
			case "rejected":
				steps = append(steps, JourneyStep{Kind: "returned", At: *closed, Org: to, To: &from})
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if res.DispensedAt != nil && res.DispensedBy != nil {
		steps = append(steps, JourneyStep{Kind: "dispensed", At: *res.DispensedAt, Org: *res.DispensedBy})
	}
	return steps, nil
}

type MyScan struct {
	Code        string    `json:"code"`
	Result      string    `json:"result"`
	ProductName string    `json:"product_name"`
	BatchNumber string    `json:"batch_number"`
	CheckedAt   time.Time `json:"checked_at"`
}

func (a *App) MyScans(ctx context.Context, actor *Actor, p PageParams) (*Page[MyScan], error) {
	if actor == nil {
		return nil, ErrUnauthorized
	}
	p = p.normalized()
	page := &Page[MyScan]{Items: []MyScan{}, Limit: p.Limit, Offset: p.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM scans WHERE user_id = $1`, actor.UserID).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT s.code, s.result, coalesce(p.name || ' ' || p.strength, ''), coalesce(b.batch_number, ''), s.created_at
		FROM scans s LEFT JOIN units u ON u.id = s.unit_id LEFT JOIN batches b ON b.id = u.batch_id
		LEFT JOIN products p ON p.id = b.product_id
		WHERE s.user_id = $1 ORDER BY s.created_at DESC LIMIT $2 OFFSET $3`, actor.UserID, p.Limit, p.Offset)
	if err != nil {
		return nil, err
	}
	page.Items, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (MyScan, error) {
		var s MyScan
		err := r.Scan(&s.Code, &s.Result, &s.ProductName, &s.BatchNumber, &s.CheckedAt)
		s.Code = FormatCode(s.Code)
		return s, err
	})
	return page, err
}

// ---- Counterfeit reports ----

type ReportInput struct {
	Code        string `json:"code"`
	ProductName string `json:"product_name"`
	Place       string `json:"place"`
	Contact     string `json:"contact"`
	Description string `json:"description"`
}

type Report struct {
	ID           string    `json:"id"`
	Code         string    `json:"code"`
	KnownCode    bool      `json:"known_code"`
	ProductName  string    `json:"product_name"`
	Place        string    `json:"place"`
	Contact      string    `json:"contact"`
	Description  string    `json:"description"`
	Status       string    `json:"status"`
	AdminNote    string    `json:"admin_note"`
	ReporterName string    `json:"reporter_name"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

const reportSelect = `SELECT r.id, r.code, r.unit_id IS NOT NULL, r.product_name, r.place, r.contact, r.description,
	r.status, r.admin_note, coalesce(u.full_name, ''), r.created_at, r.updated_at
	FROM counterfeit_reports r LEFT JOIN users u ON u.id = r.reporter_id`

func scanReport(row pgx.Row, r *Report) error {
	err := row.Scan(&r.ID, &r.Code, &r.KnownCode, &r.ProductName, &r.Place, &r.Contact, &r.Description,
		&r.Status, &r.AdminNote, &r.ReporterName, &r.CreatedAt, &r.UpdatedAt)
	r.Code = FormatCode(r.Code)
	return err
}

func (a *App) CreateReport(ctx context.Context, actor *Actor, in ReportInput) (*Report, error) {
	v := Validator{}
	v.Check(len(trim(in.Description)) >= 10, "description", "Describe what looked wrong (at least 10 characters).")
	v.Check(len(in.Description) <= 4000, "description", "Keep the description under 4000 characters.")
	v.Check(len(in.Contact) <= 200 && len(in.Place) <= 200 && len(in.ProductName) <= 200, "description", "Some fields are too long.")
	if err := v.Err(); err != nil {
		return nil, err
	}
	code := NormalizeCode(in.Code)
	var reporter *string
	if actor != nil {
		reporter = &actor.UserID
	}
	var id string
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		var unitID *int64
		var manufacturerID, batchID string
		if validCode(code) {
			var uid int64
			err := tx.QueryRow(ctx, `SELECT u.id, b.manufacturer_id, b.id FROM units u JOIN batches b ON b.id = u.batch_id WHERE u.code = $1`, code).
				Scan(&uid, &manufacturerID, &batchID)
			if err == nil {
				unitID = &uid
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
		}
		if err := tx.QueryRow(ctx, `INSERT INTO counterfeit_reports (code, unit_id, reporter_id, contact, product_name, place, description)
			VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
			code, unitID, reporter, trim(in.Contact), trim(in.ProductName), trim(in.Place), trim(in.Description)).Scan(&id); err != nil {
			return err
		}
		title := "New counterfeit report"
		if in.ProductName != "" {
			title += ": " + trim(in.ProductName)
		}
		if err := a.notify(ctx, tx, notice{ForAdmins: true, Kind: "report", Title: title, Body: trim(in.Place), Link: "/app/admin/reports"}); err != nil {
			return err
		}
		if manufacturerID != "" {
			return a.notify(ctx, tx, notice{OrgID: manufacturerID, Kind: "report",
				Title: "A customer reported a problem with one of your packs", Body: "Code " + FormatCode(code),
				Link: "/app/batches/" + batchID})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	var r Report
	if err := scanReport(a.DB.QueryRow(ctx, reportSelect+` WHERE r.id = $1`, id), &r); err != nil {
		return nil, err
	}
	return &r, nil
}

func (a *App) MyReports(ctx context.Context, actor *Actor) ([]Report, error) {
	if actor == nil {
		return nil, ErrUnauthorized
	}
	rows, err := a.DB.Query(ctx, reportSelect+` WHERE r.reporter_id = $1 ORDER BY r.created_at DESC LIMIT 100`, actor.UserID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Report, error) {
		var r Report
		err := scanReport(row, &r)
		return r, err
	})
}
