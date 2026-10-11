package app

import (
	"context"

	"github.com/jackc/pgx/v5"
)

type OrgContactInput struct {
	Address   string   `json:"address"`
	Phone     string   `json:"phone"`
	Email     string   `json:"email"`
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

// UpdateOwnOrganization lets members edit contact details. Name, type and license are
// fixed after registration because the admin approved them.
func (a *App) UpdateOwnOrganization(ctx context.Context, actor *Actor, in OrgContactInput) (*OrgView, error) {
	if !actor.IsBusiness() {
		return nil, errForbidden("Only organization accounts can do this.")
	}
	v := Validator{}
	if in.Email != "" {
		v.Check(emailRe.MatchString(normalizeEmail(in.Email)), "email", "Enter a valid email address.")
	}
	v.Check((in.Latitude == nil) == (in.Longitude == nil), "latitude", "Give both latitude and longitude, or neither.")
	if in.Latitude != nil && in.Longitude != nil {
		v.Check(*in.Latitude >= -90 && *in.Latitude <= 90, "latitude", "Latitude must be between -90 and 90.")
		v.Check(*in.Longitude >= -180 && *in.Longitude <= 180, "longitude", "Longitude must be between -180 and 180.")
	}
	if err := v.Err(); err != nil {
		return nil, err
	}
	var org OrgView
	err := a.inTx(ctx, func(tx pgx.Tx) error {
		if err := scanOrg(tx.QueryRow(ctx, `UPDATE organizations o SET address = $2, phone = $3, email = $4,
				latitude = $5, longitude = $6, updated_at = now()
			WHERE o.id = $1 RETURNING `+orgColumns, actor.OrgID, trim(in.Address), trim(in.Phone), normalizeEmail(in.Email),
			in.Latitude, in.Longitude), &org); err != nil {
			return err
		}
		return a.audit(ctx, tx, actor, "organization.contact_updated", "organization", actor.OrgID, nil)
	})
	if err != nil {
		return nil, err
	}
	return &org, nil
}

type DirectoryEntry struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Type    string `json:"type"`
	City    string `json:"city"`
	Country string `json:"country"`
}

// allowedRecipients defines which organization types each type may ship to.
var allowedRecipients = map[string][]string{
	RoleManufacturer: {RoleImporter, RolePharmacy},
	RoleImporter:     {RoleImporter, RolePharmacy},
	RolePharmacy:     {RolePharmacy},
}

// Directory lists active organizations the actor is allowed to ship to.
func (a *App) Directory(ctx context.Context, actor *Actor, orgType, q string) ([]DirectoryEntry, error) {
	if err := requireActiveOrg(actor, RoleManufacturer, RoleImporter, RolePharmacy); err != nil {
		return nil, err
	}
	types := allowedRecipients[actor.Role]
	if orgType != "" {
		types = filterStrings(types, orgType)
	}
	rows, err := a.DB.Query(ctx, `SELECT id, name, type, city, country FROM organizations
		WHERE status = 'active' AND type = ANY($1) AND id <> $2
		  AND ($3 = '' OR name ILIKE '%' || $3 || '%' OR city ILIKE '%' || $3 || '%')
		ORDER BY name LIMIT 50`, types, actor.OrgID, trim(q))
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (DirectoryEntry, error) {
		var d DirectoryEntry
		err := r.Scan(&d.ID, &d.Name, &d.Type, &d.City, &d.Country)
		return d, err
	})
}

func filterStrings(list []string, keep string) []string {
	for _, s := range list {
		if s == keep {
			return []string{s}
		}
	}
	return []string{}
}
