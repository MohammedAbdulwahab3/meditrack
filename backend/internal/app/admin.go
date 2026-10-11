package app

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// TrialDays is the free trial organizations get once approved.
const TrialDays = 30

type CountBy map[string]int

type DailyCount struct {
	Day   string `json:"day"`
	Count int    `json:"count"`
}

type Stats struct {
	Organizations     CountBy      `json:"organizations"`      // by status
	OrganizationTypes CountBy      `json:"organization_types"` // active orgs by type
	Users             CountBy      `json:"users"`              // by role
	Products          int          `json:"products"`
	Batches           int          `json:"batches"`
	ActiveRecalls     int          `json:"active_recalls"`
	Units             int          `json:"units"`
	UnitsDispensed    int          `json:"units_dispensed"`
	Scans30d          CountBy      `json:"scans_30d"` // by result
	ScansDaily        []DailyCount `json:"scans_daily"`
	OpenReports       int          `json:"open_reports"`
}

func (a *App) countBy(ctx context.Context, sql string, args ...any) (CountBy, error) {
	rows, err := a.DB.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := CountBy{}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		out[k] = n
	}
	return out, rows.Err()
}

func (a *App) AdminStats(ctx context.Context, actor *Actor) (*Stats, error) {
	if err := requireRole(actor, RoleAdmin); err != nil {
		return nil, err
	}
	s := &Stats{}
	var err error
	if s.Organizations, err = a.countBy(ctx, `SELECT status, count(*) FROM organizations GROUP BY status`); err != nil {
		return nil, err
	}
	if s.OrganizationTypes, err = a.countBy(ctx, `SELECT type, count(*) FROM organizations WHERE status = 'active' GROUP BY type`); err != nil {
		return nil, err
	}
	if s.Users, err = a.countBy(ctx, `SELECT role, count(*) FROM users WHERE is_active GROUP BY role`); err != nil {
		return nil, err
	}
	if s.Scans30d, err = a.countBy(ctx, `SELECT result, count(*) FROM scans
		WHERE created_at > now() - interval '30 days' AND scanner_role IN ('public', 'patient') GROUP BY result`); err != nil {
		return nil, err
	}
	err = a.DB.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM products),
		(SELECT count(*) FROM batches),
		(SELECT count(*) FROM batches WHERE recalled_at IS NOT NULL AND expires_on > current_date),
		(SELECT count(*) FROM units),
		(SELECT count(*) FROM units WHERE status = 'dispensed'),
		(SELECT count(*) FROM counterfeit_reports WHERE status <> 'closed')`).
		Scan(&s.Products, &s.Batches, &s.ActiveRecalls, &s.Units, &s.UnitsDispensed, &s.OpenReports)
	if err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT to_char(d, 'YYYY-MM-DD'), count(s.id)
		FROM generate_series(current_date - 13, current_date, interval '1 day') d
		LEFT JOIN scans s ON s.created_at >= d AND s.created_at < d + interval '1 day' AND s.scanner_role IN ('public', 'patient')
		GROUP BY d ORDER BY d`)
	if err != nil {
		return nil, err
	}
	s.ScansDaily, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (DailyCount, error) {
		var d DailyCount
		err := r.Scan(&d.Day, &d.Count)
		return d, err
	})
	return s, err
}

// ---- Organizations ----

type AdminOrg struct {
	OrgView
	Members  int `json:"members"`
	Products int `json:"products"`
}

type OrgFilter struct {
	PageParams
	Status string
	Type   string
	Q      string
}

func (a *App) AdminListOrganizations(ctx context.Context, actor *Actor, f OrgFilter) (*Page[AdminOrg], error) {
	if err := requireRole(actor, RoleAdmin); err != nil {
		return nil, err
	}
	f.PageParams = f.normalized()
	where := ` WHERE ($1 = '' OR o.status = $1) AND ($2 = '' OR o.type = $2)
		AND ($3 = '' OR o.name ILIKE '%' || $3 || '%' OR o.license_number ILIKE '%' || $3 || '%' OR o.city ILIKE '%' || $3 || '%')`
	args := []any{f.Status, f.Type, trim(f.Q)}
	page := &Page[AdminOrg]{Items: []AdminOrg{}, Limit: f.Limit, Offset: f.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM organizations o`+where, args...).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT `+orgColumns+`,
			(SELECT count(*) FROM users u WHERE u.organization_id = o.id),
			(SELECT count(*) FROM products p WHERE p.manufacturer_id = o.id)
		FROM organizations o`+where+`
		ORDER BY (o.status = 'pending') DESC, o.created_at DESC LIMIT $4 OFFSET $5`, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var o AdminOrg
		if err := rows.Scan(&o.ID, &o.Name, &o.Type, &o.LicenseNumber, &o.Country, &o.City, &o.Address, &o.Phone,
			&o.Email, &o.Status, &o.StatusReason, &o.ApprovedAt, &o.TrialEndsAt, &o.CreatedAt, &o.Latitude, &o.Longitude,
			&o.Members, &o.Products); err != nil {
			return nil, err
		}
		page.Items = append(page.Items, o)
	}
	return page, rows.Err()
}

var orgTransitions = map[string][]string{
	"pending":   {"active", "rejected"},
	"active":    {"suspended"},
	"suspended": {"active"},
	"rejected":  {"active"},
}

func (a *App) AdminSetOrganizationStatus(ctx context.Context, actor *Actor, id string, in StatusInput) (*OrgView, error) {
	if err := requireRole(actor, RoleAdmin); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("Organization")
	}
	if (in.Status == "rejected" || in.Status == "suspended") && len(trim(in.Reason)) < 3 {
		return nil, errInvalid(map[string]string{"reason": "Give the organization a reason."})
	}
	var org OrgView
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		var current string
		var approvedAt *time.Time
		err := tx.QueryRow(ctx, `SELECT status, approved_at FROM organizations WHERE id = $1 FOR UPDATE`, id).Scan(&current, &approvedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound("Organization")
		}
		if err != nil {
			return err
		}
		if len(filterStrings(orgTransitions[current], in.Status)) == 0 {
			return errConflict("Can't change an organization from " + current + " to " + in.Status + ".")
		}
		reason := trim(in.Reason)
		if in.Status == "active" {
			reason = ""
		}
		if err := scanOrg(tx.QueryRow(ctx, `UPDATE organizations o SET status = $2, status_reason = $3, updated_at = now(),
				approved_at = CASE WHEN $2 = 'active' THEN coalesce(approved_at, now()) ELSE approved_at END,
				trial_ends_at = CASE WHEN $2 = 'active' AND approved_at IS NULL THEN now() + make_interval(days => $4) ELSE trial_ends_at END
			WHERE o.id = $1 RETURNING `+orgColumns, id, in.Status, reason, TrialDays), &org); err != nil {
			return err
		}
		titles := map[string]string{
			"active":    "Your organization is approved",
			"rejected":  "Your registration was not approved",
			"suspended": "Your organization has been suspended",
		}
		body := reason
		if in.Status == "active" && approvedAt == nil {
			body = "Welcome to MediTrack. Your free trial runs until " + org.TrialEndsAt.Format("2 Jan 2006") + "."
		}
		if err := a.notify(ctx, tx, notice{OrgID: id, Kind: "organization_status", Title: titles[in.Status], Body: body, Link: "/app"}); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "organization.status_changed", "organization", id,
			map[string]any{"from": current, "to": in.Status, "reason": reason})
	})
	if err != nil {
		return nil, err
	}
	return &org, nil
}

// ---- Users ----

type AdminUser struct {
	UserView
	OrganizationID   *string    `json:"organization_id"`
	OrganizationName *string    `json:"organization_name"`
	LastLoginAt      *time.Time `json:"last_login_at"`
}

type UserFilter struct {
	PageParams
	Role string
	Q    string
}

func (a *App) AdminListUsers(ctx context.Context, actor *Actor, f UserFilter) (*Page[AdminUser], error) {
	if err := requireRole(actor, RoleAdmin); err != nil {
		return nil, err
	}
	f.PageParams = f.normalized()
	where := ` WHERE ($1 = '' OR u.role = $1) AND ($2 = '' OR u.email ILIKE '%' || $2 || '%' OR u.full_name ILIKE '%' || $2 || '%')`
	args := []any{f.Role, trim(f.Q)}
	page := &Page[AdminUser]{Items: []AdminUser{}, Limit: f.Limit, Offset: f.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM users u`+where, args...).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT u.id, u.email, u.full_name, u.phone, u.role, u.is_active, u.created_at,
			u.organization_id, o.name, u.last_login_at
		FROM users u LEFT JOIN organizations o ON o.id = u.organization_id`+where+`
		ORDER BY u.created_at DESC LIMIT $3 OFFSET $4`, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return nil, err
	}
	page.Items, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (AdminUser, error) {
		var u AdminUser
		err := r.Scan(&u.ID, &u.Email, &u.FullName, &u.Phone, &u.Role, &u.IsActive, &u.CreatedAt,
			&u.OrganizationID, &u.OrganizationName, &u.LastLoginAt)
		return u, err
	})
	return page, err
}

type ActiveInput struct {
	Active bool `json:"active"`
}

func (a *App) AdminSetUserActive(ctx context.Context, actor *Actor, id string, in ActiveInput) error {
	if err := requireRole(actor, RoleAdmin); err != nil {
		return err
	}
	if !IsUUID(id) {
		return errNotFound("User")
	}
	if id == actor.UserID && !in.Active {
		return errConflict("You can't deactivate your own account.")
	}
	return a.inTx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1`, id, in.Active)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return errNotFound("User")
		}
		if !in.Active {
			if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, id); err != nil {
				return err
			}
		}
		return a.audit(ctx, tx, actor, "user.active_changed", "user", id, map[string]any{"active": in.Active})
	})
}

// TemporaryPassword is shown once to the admin, who passes it to the user.
type TemporaryPassword struct {
	Password string `json:"temporary_password"`
}

// tempAlphabet avoids look-alike characters (0/O, 1/I/L) so the password is easy to read out.
const tempAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func newTemporaryPassword() (string, error) {
	// Rejection sampling keeps every character equally likely.
	limit := byte(256 - 256%len(tempAlphabet))
	out := make([]byte, 0, 14)
	buf := make([]byte, 32)
	for n := 0; n < 12; {
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		for _, c := range buf {
			if c >= limit || n == 12 {
				continue
			}
			if n > 0 && n%4 == 0 {
				out = append(out, '-')
			}
			out = append(out, tempAlphabet[int(c)%len(tempAlphabet)])
			n++
		}
	}
	return string(out), nil
}

// AdminResetPassword replaces a user's password with a one-time temporary one, signs them out
// everywhere and makes them choose a new password at next sign-in.
func (a *App) AdminResetPassword(ctx context.Context, actor *Actor, id string) (*TemporaryPassword, error) {
	if err := requireRole(actor, RoleAdmin); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("User")
	}
	if id == actor.UserID {
		return nil, errConflict("Use Change password for your own account.")
	}
	temp, err := newTemporaryPassword()
	if err != nil {
		return nil, err
	}
	hash, err := hashPassword(temp)
	if err != nil {
		return nil, err
	}
	err = a.inTx(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `UPDATE users SET password_hash = $2, must_change_password = true, updated_at = now() WHERE id = $1`, id, hash)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return errNotFound("User")
		}
		if _, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, id); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "user.password_reset", "user", id, nil)
	})
	if err != nil {
		return nil, err
	}
	return &TemporaryPassword{Password: temp}, nil
}

// ---- Counterfeit reports ----

type ReportFilter struct {
	PageParams
	Status string
}

func (a *App) AdminListReports(ctx context.Context, actor *Actor, f ReportFilter) (*Page[Report], error) {
	if err := requireRole(actor, RoleAdmin); err != nil {
		return nil, err
	}
	f.PageParams = f.normalized()
	page := &Page[Report]{Items: []Report{}, Limit: f.Limit, Offset: f.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM counterfeit_reports WHERE ($1 = '' OR status = $1)`, f.Status).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, reportSelect+` WHERE ($1 = '' OR r.status = $1) ORDER BY r.created_at DESC LIMIT $2 OFFSET $3`,
		f.Status, f.Limit, f.Offset)
	if err != nil {
		return nil, err
	}
	page.Items, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (Report, error) {
		var r Report
		err := scanReport(row, &r)
		return r, err
	})
	return page, err
}

type ReportUpdateInput struct {
	Status    string `json:"status"`
	AdminNote string `json:"admin_note"`
}

func (a *App) AdminUpdateReport(ctx context.Context, actor *Actor, id string, in ReportUpdateInput) (*Report, error) {
	if err := requireRole(actor, RoleAdmin); err != nil {
		return nil, err
	}
	if !IsUUID(id) {
		return nil, errNotFound("Report")
	}
	if in.Status != "open" && in.Status != "investigating" && in.Status != "closed" {
		return nil, errInvalid(map[string]string{"status": "Unknown status."})
	}
	var r Report
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		var reporter *string
		err := tx.QueryRow(ctx, `UPDATE counterfeit_reports SET status = $2, admin_note = $3, updated_at = now()
			WHERE id = $1 RETURNING reporter_id`, id, in.Status, trim(in.AdminNote)).Scan(&reporter)
		if errors.Is(err, pgx.ErrNoRows) {
			return errNotFound("Report")
		}
		if err != nil {
			return err
		}
		if reporter != nil {
			if err := a.notify(ctx, tx, notice{UserID: *reporter, Kind: "report_update",
				Title: "Your report is now " + in.Status, Body: trim(in.AdminNote), Link: "/app/reports"}); err != nil {
				return err
			}
		}
		if err := a.audit(ctx, tx, actor, "report.updated", "report", id, map[string]any{"status": in.Status}); err != nil {
			return err
		}
		return scanReport(tx.QueryRow(ctx, reportSelect+` WHERE r.id = $1`, id), &r)
	})
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// ---- Audit log ----

type AuditEvent struct {
	ID         int64           `json:"id"`
	Action     string          `json:"action"`
	EntityType string          `json:"entity_type"`
	EntityID   string          `json:"entity_id"`
	Details    json.RawMessage `json:"details"`
	ActorEmail *string         `json:"actor_email"`
	OrgName    *string         `json:"organization_name"`
	CreatedAt  time.Time       `json:"created_at"`
}

func (a *App) AdminAudit(ctx context.Context, actor *Actor, q string, p PageParams) (*Page[AuditEvent], error) {
	if err := requireRole(actor, RoleAdmin); err != nil {
		return nil, err
	}
	p = p.normalized()
	where := ` WHERE ($1 = '' OR e.action ILIKE '%' || $1 || '%' OR o.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')`
	from := ` FROM audit_events e LEFT JOIN users u ON u.id = e.actor_id LEFT JOIN organizations o ON o.id = e.organization_id`
	page := &Page[AuditEvent]{Items: []AuditEvent{}, Limit: p.Limit, Offset: p.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*)`+from+where, trim(q)).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT e.id, e.action, e.entity_type, e.entity_id, e.details, u.email, o.name, e.created_at`+
		from+where+` ORDER BY e.id DESC LIMIT $2 OFFSET $3`, trim(q), p.Limit, p.Offset)
	if err != nil {
		return nil, err
	}
	page.Items, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (AuditEvent, error) {
		var e AuditEvent
		err := r.Scan(&e.ID, &e.Action, &e.EntityType, &e.EntityID, &e.Details, &e.ActorEmail, &e.OrgName, &e.CreatedAt)
		return e, err
	})
	return page, err
}
