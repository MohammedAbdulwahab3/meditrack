package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

type UserView struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Phone     string    `json:"phone"`
	Role      string    `json:"role"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type OrgView struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Type          string     `json:"type"`
	LicenseNumber string     `json:"license_number"`
	Country       string     `json:"country"`
	City          string     `json:"city"`
	Address       string     `json:"address"`
	Phone         string     `json:"phone"`
	Email         string     `json:"email"`
	Status        string     `json:"status"`
	StatusReason  string     `json:"status_reason"`
	ApprovedAt    *time.Time `json:"approved_at"`
	TrialEndsAt   *time.Time `json:"trial_ends_at"`
	CreatedAt     time.Time  `json:"created_at"`
	Latitude      *float64   `json:"latitude"`
	Longitude     *float64   `json:"longitude"`
}

const orgColumns = `o.id, o.name, o.type, o.license_number, o.country, o.city, o.address, o.phone, o.email,
	o.status, o.status_reason, o.approved_at, o.trial_ends_at, o.created_at, o.latitude, o.longitude`

func scanOrg(row pgx.Row, o *OrgView) error {
	return row.Scan(&o.ID, &o.Name, &o.Type, &o.LicenseNumber, &o.Country, &o.City, &o.Address, &o.Phone,
		&o.Email, &o.Status, &o.StatusReason, &o.ApprovedAt, &o.TrialEndsAt, &o.CreatedAt, &o.Latitude, &o.Longitude)
}

type Me struct {
	User         UserView `json:"user"`
	Organization *OrgView `json:"organization"`
}

type Session struct {
	Token     string    `json:"-"`
	ExpiresAt time.Time `json:"expires_at"`
	Me        Me        `json:"me"`
}

// A fixed hash compared against when the email is unknown, so login timing doesn't reveal accounts.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("not-a-real-password"), bcrypt.DefaultCost)

func hashPassword(pw string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(h), err
}

func validatePassword(v Validator, field, pw string) {
	v.Check(len(pw) >= 8, field, "Use at least 8 characters.")
	v.Check(len(pw) <= 72, field, "Use at most 72 characters.")
}

func normalizeEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

type RegisterPatientInput struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

func (a *App) RegisterPatient(ctx context.Context, in RegisterPatientInput, userAgent string) (*Session, error) {
	in.Email = normalizeEmail(in.Email)
	v := Validator{}
	v.Required(in.FullName, "full_name")
	v.Check(emailRe.MatchString(in.Email), "email", "Enter a valid email address.")
	validatePassword(v, "password", in.Password)
	if err := v.Err(); err != nil {
		return nil, err
	}
	hash, err := hashPassword(in.Password)
	if err != nil {
		return nil, err
	}
	var userID string
	err = a.DB.QueryRow(ctx, `INSERT INTO users (email, password_hash, full_name, phone, role)
		VALUES ($1, $2, $3, $4, 'patient') RETURNING id`,
		in.Email, hash, trim(in.FullName), trim(in.Phone)).Scan(&userID)
	if isUniqueViolation(err) {
		return nil, errInvalid(map[string]string{"email": "An account with this email already exists."})
	}
	if err != nil {
		return nil, err
	}
	return a.createSession(ctx, userID, userAgent)
}

type OrgInput struct {
	Name          string `json:"name"`
	Type          string `json:"type"`
	LicenseNumber string `json:"license_number"`
	Country       string `json:"country"`
	City          string `json:"city"`
	Address       string `json:"address"`
	Phone         string `json:"phone"`
	Email         string `json:"email"`
}

type RegisterBusinessInput struct {
	FullName     string   `json:"full_name"`
	Email        string   `json:"email"`
	Phone        string   `json:"phone"`
	Password     string   `json:"password"`
	Organization OrgInput `json:"organization"`
}

func (a *App) RegisterBusiness(ctx context.Context, in RegisterBusinessInput, userAgent string) (*Session, error) {
	in.Email = normalizeEmail(in.Email)
	org := in.Organization
	v := Validator{}
	v.Required(in.FullName, "full_name")
	v.Check(emailRe.MatchString(in.Email), "email", "Enter a valid email address.")
	validatePassword(v, "password", in.Password)
	v.Required(org.Name, "organization.name")
	v.Check(org.Type == RoleManufacturer || org.Type == RoleImporter || org.Type == RolePharmacy,
		"organization.type", "Choose manufacturer, importer or pharmacy.")
	v.Required(org.LicenseNumber, "organization.license_number")
	v.Required(org.Country, "organization.country")
	v.Required(org.City, "organization.city")
	if org.Email != "" {
		v.Check(emailRe.MatchString(org.Email), "organization.email", "Enter a valid email address.")
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	hash, err := hashPassword(in.Password)
	if err != nil {
		return nil, err
	}

	var userID string
	err = a.inTx(ctx, func(tx pgx.Tx) error {
		var orgID string
		err := tx.QueryRow(ctx, `INSERT INTO organizations (name, type, license_number, country, city, address, phone, email)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
			trim(org.Name), org.Type, trim(org.LicenseNumber), trim(org.Country), trim(org.City),
			trim(org.Address), trim(org.Phone), normalizeEmail(org.Email)).Scan(&orgID)
		if isUniqueViolation(err) {
			return errInvalid(map[string]string{"organization.license_number": "An organization with this license is already registered."})
		}
		if err != nil {
			return err
		}
		err = tx.QueryRow(ctx, `INSERT INTO users (email, password_hash, full_name, phone, role, organization_id)
			VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
			in.Email, hash, trim(in.FullName), trim(in.Phone), org.Type, orgID).Scan(&userID)
		if isUniqueViolation(err) {
			return errInvalid(map[string]string{"email": "An account with this email already exists."})
		}
		if err != nil {
			return err
		}
		actor := &Actor{UserID: userID, Role: org.Type, OrgID: orgID}
		if err := a.audit(ctx, tx, actor, "organization.registered", "organization", orgID, map[string]any{"name": org.Name, "type": org.Type}); err != nil {
			return err
		}
		return a.notify(ctx, tx, notice{ForAdmins: true, Kind: "organization_pending",
			Title: "New " + org.Type + " awaiting approval", Body: trim(org.Name) + " (" + trim(org.City) + ") registered and needs review.",
			Link: "/app/admin/organizations?status=pending"})
	})
	if err != nil {
		return nil, err
	}
	return a.createSession(ctx, userID, userAgent)
}

type LoginInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

var errBadCredentials = &Error{Status: 401, Code: "invalid_credentials", Message: "Email or password is incorrect."}

func (a *App) Login(ctx context.Context, in LoginInput, userAgent string) (*Session, error) {
	var id, hash string
	var active bool
	err := a.DB.QueryRow(ctx, `SELECT id, password_hash, is_active FROM users WHERE lower(email) = $1`,
		normalizeEmail(in.Email)).Scan(&id, &hash, &active)
	if errors.Is(err, pgx.ErrNoRows) {
		bcrypt.CompareHashAndPassword(dummyHash, []byte(in.Password))
		return nil, errBadCredentials
	}
	if err != nil {
		return nil, err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
		return nil, errBadCredentials
	}
	if !active {
		return nil, errForbidden("This account has been deactivated. Contact support.")
	}
	if _, err := a.DB.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, id); err != nil {
		return nil, err
	}
	return a.createSession(ctx, id, userAgent)
}

func (a *App) createSession(ctx context.Context, userID, userAgent string) (*Session, error) {
	token, err := newToken()
	if err != nil {
		return nil, err
	}
	expires := a.Now().Add(a.SessionTTL)
	if len(userAgent) > 255 {
		userAgent = userAgent[:255]
	}
	if _, err := a.DB.Exec(ctx, `INSERT INTO sessions (token_hash, user_id, user_agent, expires_at) VALUES ($1, $2, $3, $4)`,
		hashToken(token), userID, userAgent, expires); err != nil {
		return nil, err
	}
	me, err := a.GetMe(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &Session{Token: token, ExpiresAt: expires, Me: *me}, nil
}

func (a *App) Logout(ctx context.Context, token string) error {
	_, err := a.DB.Exec(ctx, `DELETE FROM sessions WHERE token_hash = $1`, hashToken(token))
	return err
}

// Authenticate resolves a session token to the acting user.
func (a *App) Authenticate(ctx context.Context, token string) (*Actor, error) {
	if token == "" {
		return nil, ErrUnauthorized
	}
	var actor Actor
	var orgID, orgStatus *string
	err := a.DB.QueryRow(ctx, `
		SELECT u.id, u.role, u.organization_id, o.status
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		LEFT JOIN organizations o ON o.id = u.organization_id
		WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`,
		hashToken(token)).Scan(&actor.UserID, &actor.Role, &orgID, &orgStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUnauthorized
	}
	if err != nil {
		return nil, err
	}
	if orgID != nil {
		actor.OrgID = *orgID
		actor.OrgStatus = *orgStatus
	}
	return &actor, nil
}

func (a *App) GetMe(ctx context.Context, userID string) (*Me, error) {
	var me Me
	var orgID *string
	err := a.DB.QueryRow(ctx, `SELECT id, email, full_name, phone, role, is_active, created_at, organization_id
		FROM users WHERE id = $1`, userID).Scan(&me.User.ID, &me.User.Email, &me.User.FullName, &me.User.Phone,
		&me.User.Role, &me.User.IsActive, &me.User.CreatedAt, &orgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errNotFound("User")
	}
	if err != nil {
		return nil, err
	}
	if orgID != nil {
		var org OrgView
		if err := scanOrg(a.DB.QueryRow(ctx, `SELECT `+orgColumns+` FROM organizations o WHERE o.id = $1`, *orgID), &org); err != nil {
			return nil, err
		}
		me.Organization = &org
	}
	return &me, nil
}

type UpdateProfileInput struct {
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
}

func (a *App) UpdateProfile(ctx context.Context, actor *Actor, in UpdateProfileInput) (*Me, error) {
	v := Validator{}
	v.Required(in.FullName, "full_name")
	if err := v.Err(); err != nil {
		return nil, err
	}
	if _, err := a.DB.Exec(ctx, `UPDATE users SET full_name = $2, phone = $3, updated_at = now() WHERE id = $1`,
		actor.UserID, trim(in.FullName), trim(in.Phone)); err != nil {
		return nil, err
	}
	return a.GetMe(ctx, actor.UserID)
}

type ChangePasswordInput struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword updates the password and signs out every other session.
func (a *App) ChangePassword(ctx context.Context, actor *Actor, currentToken string, in ChangePasswordInput) error {
	v := Validator{}
	validatePassword(v, "new_password", in.NewPassword)
	if err := v.Err(); err != nil {
		return err
	}
	var hash string
	if err := a.DB.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, actor.UserID).Scan(&hash); err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.CurrentPassword)) != nil {
		return errInvalid(map[string]string{"current_password": "Current password is incorrect."})
	}
	newHash, err := hashPassword(in.NewPassword)
	if err != nil {
		return err
	}
	return a.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, actor.UserID, newHash); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, actor.UserID, hashToken(currentToken))
		return err
	})
}

// EnsureAdmin creates the bootstrap admin account if no admin exists yet.
func (a *App) EnsureAdmin(ctx context.Context, email, password, name string) (bool, error) {
	if email == "" || password == "" {
		return false, nil
	}
	var exists bool
	if err := a.DB.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`).Scan(&exists); err != nil {
		return false, err
	}
	if exists {
		return false, nil
	}
	if len(password) < 8 {
		return false, errors.New("ADMIN_PASSWORD must be at least 8 characters")
	}
	hash, err := hashPassword(password)
	if err != nil {
		return false, err
	}
	_, err = a.DB.Exec(ctx, `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, 'admin')
		ON CONFLICT DO NOTHING`, normalizeEmail(email), hash, name)
	return err == nil, err
}

// ---- Organization team members ----

type AddMemberInput struct {
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Password string `json:"password"`
}

func (a *App) ListMembers(ctx context.Context, actor *Actor) ([]UserView, error) {
	if !actor.IsBusiness() {
		return nil, errForbidden("Only organization accounts have team members.")
	}
	rows, err := a.DB.Query(ctx, `SELECT id, email, full_name, phone, role, is_active, created_at
		FROM users WHERE organization_id = $1 ORDER BY created_at`, actor.OrgID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (UserView, error) {
		var u UserView
		err := r.Scan(&u.ID, &u.Email, &u.FullName, &u.Phone, &u.Role, &u.IsActive, &u.CreatedAt)
		return u, err
	})
}

func (a *App) AddMember(ctx context.Context, actor *Actor, in AddMemberInput) (*UserView, error) {
	if err := requireActiveOrg(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return nil, err
	}
	in.Email = normalizeEmail(in.Email)
	v := Validator{}
	v.Required(in.FullName, "full_name")
	v.Check(emailRe.MatchString(in.Email), "email", "Enter a valid email address.")
	validatePassword(v, "password", in.Password)
	if err := v.Err(); err != nil {
		return nil, err
	}
	hash, err := hashPassword(in.Password)
	if err != nil {
		return nil, err
	}
	var u UserView
	err = a.inTx(ctx, func(tx pgx.Tx) error {
		err := tx.QueryRow(ctx, `INSERT INTO users (email, password_hash, full_name, phone, role, organization_id)
			VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, full_name, phone, role, is_active, created_at`,
			in.Email, hash, trim(in.FullName), trim(in.Phone), actor.Role, actor.OrgID).
			Scan(&u.ID, &u.Email, &u.FullName, &u.Phone, &u.Role, &u.IsActive, &u.CreatedAt)
		if isUniqueViolation(err) {
			return errInvalid(map[string]string{"email": "An account with this email already exists."})
		}
		if err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "member.added", "user", u.ID, map[string]any{"email": u.Email})
	})
	if err != nil {
		return nil, err
	}
	return &u, nil
}
