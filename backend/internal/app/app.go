// Package app holds MediTrack's business logic. Handlers in httpapi translate HTTP to calls
// here; every rule about who may do what lives in this package.
package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type App struct {
	DB         *pgxpool.Pool
	SecretKey  []byte
	SessionTTL time.Duration
	Log        *slog.Logger
	Now        func() time.Time
}

func New(pool *pgxpool.Pool, secretKey string, sessionTTL time.Duration, log *slog.Logger) *App {
	return &App{DB: pool, SecretKey: []byte(secretKey), SessionTTL: sessionTTL, Log: log, Now: time.Now}
}

// Roles
const (
	RoleAdmin        = "admin"
	RoleManufacturer = "manufacturer"
	RoleImporter     = "importer"
	RolePharmacy     = "pharmacy"
	RolePatient      = "patient"
)

// Actor is the authenticated user performing an action.
type Actor struct {
	UserID    string
	Role      string
	OrgID     string // empty for admins and patients
	OrgStatus string
}

func (a *Actor) IsAdmin() bool    { return a != nil && a.Role == RoleAdmin }
func (a *Actor) IsBusiness() bool { return a != nil && a.OrgID != "" }

// Error is a business error that maps cleanly onto an HTTP response.
type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func (e *Error) Error() string { return e.Message }

func errInvalid(fields map[string]string) error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "invalid", Message: "Please fix the highlighted fields.", Fields: fields}
}
func errBadRequest(msg string) error {
	return &Error{Status: http.StatusBadRequest, Code: "bad_request", Message: msg}
}
func errNotFound(what string) error {
	return &Error{Status: http.StatusNotFound, Code: "not_found", Message: what + " not found."}
}
func errForbidden(msg string) error {
	return &Error{Status: http.StatusForbidden, Code: "forbidden", Message: msg}
}
func errConflict(msg string) error {
	return &Error{Status: http.StatusConflict, Code: "conflict", Message: msg}
}

var ErrUnauthorized = &Error{Status: http.StatusUnauthorized, Code: "unauthorized", Message: "Please sign in."}

// Validator collects field errors.
type Validator map[string]string

func (v Validator) Check(ok bool, field, msg string) {
	if !ok {
		if _, exists := v[field]; !exists {
			v[field] = msg
		}
	}
}

func (v Validator) Required(value, field string) {
	v.Check(strings.TrimSpace(value) != "", field, "This field is required.")
}

func (v Validator) Err() error {
	if len(v) == 0 {
		return nil
	}
	return errInvalid(v)
}

var (
	uuidRe  = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	emailRe = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
)

func IsUUID(s string) bool { return uuidRe.MatchString(s) }

func parseDate(s string) (time.Time, bool) {
	t, err := time.Parse("2006-01-02", strings.TrimSpace(s))
	return t, err == nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// inTx runs fn inside a transaction, committing on success.
func (a *App) inTx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// querier is satisfied by both the pool and a transaction.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func (a *App) audit(ctx context.Context, q querier, actor *Actor, action, entityType, entityID string, details map[string]any) error {
	if details == nil {
		details = map[string]any{}
	}
	raw, err := json.Marshal(details)
	if err != nil {
		return err
	}
	var actorID, orgID *string
	if actor != nil {
		actorID = &actor.UserID
		if actor.OrgID != "" {
			orgID = &actor.OrgID
		}
	}
	_, err = q.Exec(ctx, `INSERT INTO audit_events (actor_id, organization_id, action, entity_type, entity_id, details)
		VALUES ($1, $2, $3, $4, $5, $6)`, actorID, orgID, action, entityType, entityID, raw)
	return err
}

// Notification targets: exactly one of OrgID, UserID or ForAdmins should be set.
type notice struct {
	OrgID     string
	UserID    string
	ForAdmins bool
	Kind      string
	Title     string
	Body      string
	Link      string
}

func (a *App) notify(ctx context.Context, q querier, n notice) error {
	_, err := q.Exec(ctx, `INSERT INTO notifications (organization_id, user_id, for_admins, kind, title, body, link)
		VALUES (NULLIF($1, '')::uuid, NULLIF($2, '')::uuid, $3, $4, $5, $6, $7)`,
		n.OrgID, n.UserID, n.ForAdmins, n.Kind, n.Title, n.Body, n.Link)
	return err
}

// Page is a standard paginated list response.
type Page[T any] struct {
	Items  []T `json:"items"`
	Total  int `json:"total"`
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

type PageParams struct {
	Limit  int
	Offset int
}

func (p PageParams) normalized() PageParams {
	if p.Limit <= 0 || p.Limit > 100 {
		p.Limit = 25
	}
	if p.Offset < 0 {
		p.Offset = 0
	}
	return p
}

func requireRole(actor *Actor, roles ...string) error {
	if actor == nil {
		return ErrUnauthorized
	}
	for _, r := range roles {
		if actor.Role == r {
			return nil
		}
	}
	return errForbidden("You don't have access to this action.")
}

// requireActiveOrg ensures a business user's organization has been approved.
func requireActiveOrg(actor *Actor, roles ...string) error {
	if err := requireRole(actor, roles...); err != nil {
		return err
	}
	if actor.OrgStatus != "active" {
		return errForbidden(fmt.Sprintf("Your organization is %s. An administrator must approve it first.", actor.OrgStatus))
	}
	return nil
}

func trim(s string) string { return strings.TrimSpace(s) }
