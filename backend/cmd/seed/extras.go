package main

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/meditrack/backend/internal/app"
)

// extraProduct is a demo medicine that pharmacies stock and list for patients.
type extraProduct struct {
	in     app.ProductInput
	batch  string
	price  float64 // typical retail price; each pharmacy varies it a little
	stores []string
}

// Pharmacies by demo email, in the order they are cycled through below.
var extraStores = []string{
	"pharmacy@meditrack.local", "piassa@meditrack.local", "kazanchis@meditrack.local",
	"megenagna@meditrack.local", "cmc@meditrack.local", "pharmacy2@meditrack.local",
}

// A wider catalog covering every dosage form the apps illustrate.
var extraCatalog = []extraProduct{
	{app.ProductInput{Name: "Calpol", GenericName: "Paracetamol", Strength: "120 mg/5 ml", DosageForm: "Syrup", Category: "Analgesic", PackSize: "100 ml bottle"},
		"CAL-2509", 85, []string{"pharmacy", "piassa", "kazanchis", "megenagna", "cmc", "pharmacy2"}},
	{app.ProductInput{Name: "Ventolin", GenericName: "Salbutamol", Strength: "100 mcg/dose", DosageForm: "Inhaler", Category: "Respiratory", PackSize: "200 doses", RequiresPrescription: true},
		"VEN-2508", 320, []string{"pharmacy", "kazanchis", "cmc"}},
	{app.ProductInput{Name: "Brufen", GenericName: "Ibuprofen", Strength: "400 mg", DosageForm: "Tablet", Category: "Analgesic", PackSize: "20 tablets"},
		"BRU-2509", 60, []string{"pharmacy", "piassa", "megenagna", "cmc", "pharmacy2"}},
	{app.ProductInput{Name: "Losec", GenericName: "Omeprazole", Strength: "20 mg", DosageForm: "Capsule", Category: "Gastrointestinal", PackSize: "14 capsules"},
		"LOS-2507", 140, []string{"piassa", "kazanchis", "megenagna"}},
	{app.ProductInput{Name: "Fucidin", GenericName: "Fusidic acid", Strength: "2%", DosageForm: "Cream", Category: "Dermatology", PackSize: "15 g tube"},
		"FUC-2508", 180, []string{"pharmacy", "piassa", "cmc"}},
	{app.ProductInput{Name: "Insulatard", GenericName: "Insulin isophane (human)", Strength: "100 IU/ml", DosageForm: "Injection", Category: "Antidiabetic", PackSize: "10 ml vial", RequiresPrescription: true},
		"INS-2509", 450, []string{"pharmacy", "megenagna"}},
	{app.ProductInput{Name: "Chloramphenicol", GenericName: "Chloramphenicol", Strength: "0.5%", DosageForm: "Eye drops", Category: "Ophthalmic", PackSize: "10 ml bottle", RequiresPrescription: true},
		"CHL-2508", 70, []string{"piassa", "kazanchis", "cmc", "pharmacy2"}},
	{app.ProductInput{Name: "ORS", GenericName: "Oral rehydration salts", Strength: "20.5 g", DosageForm: "Sachet", Category: "Rehydration", PackSize: "1 sachet"},
		"ORS-2509", 12, []string{"pharmacy", "piassa", "kazanchis", "megenagna", "cmc", "pharmacy2"}},
}

// seedExtras adds the wider demo catalog. It is idempotent: medicines that already exist are
// skipped, so it also tops up databases seeded by older versions.
func seedExtras(ctx context.Context, a *app.App, pool *pgxpool.Pool) (int, error) {
	actorFor := func(email string) (*app.Actor, error) {
		var act app.Actor
		err := pool.QueryRow(ctx, `SELECT u.id, u.role, o.id, o.status FROM users u JOIN organizations o ON o.id = u.organization_id
			WHERE lower(u.email) = lower($1)`, email).Scan(&act.UserID, &act.Role, &act.OrgID, &act.OrgStatus)
		if err != nil {
			return nil, err
		}
		return &act, nil
	}
	mfr, err := actorFor("manufacturer@meditrack.local")
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil // not a demo database
	} else if err != nil {
		return 0, err
	}
	stores := map[string]*app.Actor{}
	for _, email := range extraStores {
		act, err := actorFor(email)
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		} else if err != nil {
			return 0, err
		}
		stores[email[:len(email)-len("@meditrack.local")]] = act
	}

	added := 0
	today := time.Now()
	for _, p := range extraCatalog {
		var exists bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM products WHERE manufacturer_id = $1 AND name = $2)`,
			mfr.OrgID, p.in.Name).Scan(&exists); err != nil {
			return added, err
		}
		if exists {
			continue
		}
		prod, err := a.CreateProduct(ctx, mfr, p.in)
		if err != nil {
			return added, fmt.Errorf("product %s: %w", p.in.Name, err)
		}
		made := today.AddDate(0, -1, 0)
		batch, err := a.CreateBatch(ctx, mfr, app.BatchInput{ProductID: prod.ID, BatchNumber: p.batch, Quantity: 40 * len(p.stores),
			ManufacturedOn: made.Format("2006-01-02"), ExpiresOn: made.AddDate(0, 30, 0).Format("2006-01-02")})
		if err != nil {
			return added, fmt.Errorf("batch %s: %w", p.batch, err)
		}
		for i, key := range p.stores {
			store, ok := stores[key]
			if !ok {
				continue
			}
			s, err := a.CreateShipment(ctx, mfr, app.ShipmentInput{ToOrgID: store.OrgID, Notes: "Demo shipment",
				Lines: []app.ShipmentLineInput{{BatchID: batch.ID, Quantity: 12 + 7*i}}})
			if err != nil {
				return added, fmt.Errorf("ship %s to %s: %w", p.in.Name, key, err)
			}
			if _, err := a.ReceiveShipment(ctx, store, s.ID); err != nil {
				return added, err
			}
			// Prices differ a little between pharmacies, so comparing is meaningful.
			price := p.price * (1 + 0.04*float64((i*3)%5) - 0.06)
			price = float64(int(price + 0.5))
			if err := a.SetListing(ctx, store, prod.ID, app.ListingInput{UnitPrice: price, Listed: true}); err != nil {
				return added, fmt.Errorf("list %s at %s: %w", p.in.Name, key, err)
			}
		}
		added++
	}
	return added, nil
}
