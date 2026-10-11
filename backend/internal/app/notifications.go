package app

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

type Notification struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	Link      string     `json:"link"`
	ReadAt    *time.Time `json:"read_at"`
	CreatedAt time.Time  `json:"created_at"`
}

// visibleTo matches notifications addressed to the user, their organization, or (for admins) all admins.
const visibleTo = `(user_id = $1 OR organization_id::text = $2 OR (for_admins AND $3))`

func (a *App) ListNotifications(ctx context.Context, actor *Actor, unreadOnly bool, p PageParams) (*Page[Notification], error) {
	if actor == nil {
		return nil, ErrUnauthorized
	}
	p = p.normalized()
	where := ` WHERE ` + visibleTo + ` AND (NOT $4 OR read_at IS NULL)`
	args := []any{actor.UserID, actor.OrgID, actor.IsAdmin(), unreadOnly}
	page := &Page[Notification]{Items: []Notification{}, Limit: p.Limit, Offset: p.Offset}
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM notifications`+where, args...).Scan(&page.Total); err != nil {
		return nil, err
	}
	rows, err := a.DB.Query(ctx, `SELECT id, kind, title, body, link, read_at, created_at FROM notifications`+where+
		` ORDER BY created_at DESC LIMIT $5 OFFSET $6`, append(args, p.Limit, p.Offset)...)
	if err != nil {
		return nil, err
	}
	page.Items, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (Notification, error) {
		var n Notification
		err := r.Scan(&n.ID, &n.Kind, &n.Title, &n.Body, &n.Link, &n.ReadAt, &n.CreatedAt)
		return n, err
	})
	return page, err
}

func (a *App) UnreadCount(ctx context.Context, actor *Actor) (int, error) {
	if actor == nil {
		return 0, ErrUnauthorized
	}
	var n int
	err := a.DB.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE `+visibleTo+` AND read_at IS NULL`,
		actor.UserID, actor.OrgID, actor.IsAdmin()).Scan(&n)
	return n, err
}

// MarkRead marks one notification (or all, when id is empty) as read.
func (a *App) MarkRead(ctx context.Context, actor *Actor, id string) error {
	if actor == nil {
		return ErrUnauthorized
	}
	if id != "" && !IsUUID(id) {
		return errNotFound("Notification")
	}
	_, err := a.DB.Exec(ctx, `UPDATE notifications SET read_at = now()
		WHERE `+visibleTo+` AND read_at IS NULL AND ($4 = '' OR id::text = $4)`,
		actor.UserID, actor.OrgID, actor.IsAdmin(), id)
	return err
}
