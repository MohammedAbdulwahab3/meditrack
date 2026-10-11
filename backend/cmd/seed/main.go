// Command seed fills an empty database with a realistic demo supply chain, using the same
// business logic as the API (so every rule is respected). All demo accounts use the password
// "password123". It refuses to run if any organization already exists.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/meditrack/backend/internal/app"
	"github.com/meditrack/backend/internal/config"
	"github.com/meditrack/backend/internal/db"
)

const demoPassword = "password123"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "seed failed:", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}
	var orgs int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM organizations`).Scan(&orgs); err != nil {
		return err
	}
	if orgs > 0 {
		return fmt.Errorf("database already has %d organizations; seed only runs on an empty database", orgs)
	}

	a := app.New(pool, cfg.SecretKey, cfg.SessionTTL, slog.Default())
	adminEmail := cfg.AdminEmail
	if adminEmail == "" {
		adminEmail = "admin@meditrack.local"
	}
	adminPass := cfg.AdminPassword
	if adminPass == "" {
		adminPass = demoPassword
	}
	if _, err := a.EnsureAdmin(ctx, adminEmail, adminPass, "Platform Admin"); err != nil {
		return err
	}
	var adminID string
	if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`).Scan(&adminID); err != nil {
		return err
	}
	admin := &app.Actor{UserID: adminID, Role: app.RoleAdmin}

	// Organizations — registered, then approved by the admin.
	type org struct {
		actor *app.Actor
		id    string
	}
	register := func(kind, name, person, email, city, license string, approve bool) (*org, error) {
		s, err := a.RegisterBusiness(ctx, app.RegisterBusinessInput{
			FullName: person, Email: email, Password: demoPassword, Phone: "+251 911 000 000",
			Organization: app.OrgInput{Name: name, Type: kind, LicenseNumber: license, Country: "Ethiopia", City: city,
				Address: "Demo address", Phone: "+251 11 000 0000", Email: email},
		}, "seed")
		if err != nil {
			return nil, fmt.Errorf("register %s: %w", name, err)
		}
		o := &org{id: s.Me.Organization.ID, actor: &app.Actor{UserID: s.Me.User.ID, Role: kind, OrgID: s.Me.Organization.ID, OrgStatus: "pending"}}
		if approve {
			if _, err := a.AdminSetOrganizationStatus(ctx, admin, o.id, app.StatusInput{Status: "active"}); err != nil {
				return nil, err
			}
			o.actor.OrgStatus = "active"
		}
		return o, nil
	}
	mfr, err := register("manufacturer", "Abyssinia Pharmaceuticals", "Hanna Bekele", "manufacturer@meditrack.local", "Addis Ababa", "EFMHACA-MFG-0042", true)
	if err != nil {
		return err
	}
	imp, err := register("importer", "Horn Medical Imports", "Dawit Alemu", "importer@meditrack.local", "Addis Ababa", "IMP-2291", true)
	if err != nil {
		return err
	}
	ph1, err := register("pharmacy", "Bole Community Pharmacy", "Meron Tadesse", "pharmacy@meditrack.local", "Addis Ababa", "PH-10077", true)
	if err != nil {
		return err
	}
	ph2, err := register("pharmacy", "Hawassa Health Pharmacy", "Yonas Girma", "pharmacy2@meditrack.local", "Hawassa", "PH-20311", true)
	if err != nil {
		return err
	}
	if _, err := register("pharmacy", "Merkato New Pharmacy", "Selam Haile", "pending@meditrack.local", "Addis Ababa", "PH-30555", false); err != nil {
		return err
	}
	// More approved pharmacies across Addis Ababa, so "nearby" has something to show.
	extra := []struct{ name, person, email, license string }{
		{"Piassa Family Pharmacy", "Kidist Mulugeta", "piassa@meditrack.local", "PH-40101"},
		{"Kazanchis Pharmacy", "Biniam Tesfaye", "kazanchis@meditrack.local", "PH-40102"},
		{"Megenagna Medical Pharmacy", "Rahel Assefa", "megenagna@meditrack.local", "PH-40103"},
		{"CMC Community Pharmacy", "Samuel Bekele", "cmc@meditrack.local", "PH-40104"},
	}
	var more []*org
	for _, e := range extra {
		o, err := register("pharmacy", e.name, e.person, e.email, "Addis Ababa", e.license, true)
		if err != nil {
			return err
		}
		more = append(more, o)
	}

	// Real-world coordinates and street addresses.
	place := func(o *org, address string, lat, lng float64) error {
		_, err := a.UpdateOwnOrganization(ctx, o.actor, app.OrgContactInput{
			Address: address, Phone: "+251 11 000 0000", Email: "", Latitude: &lat, Longitude: &lng})
		return err
	}
	locations := []struct {
		o        *org
		address  string
		lat, lng float64
	}{
		{mfr, "Kality Industrial Zone", 8.9300, 38.7580},
		{imp, "Mexico Square, Ras Abebe Aregay St", 9.0100, 38.7460},
		{ph1, "Bole Road, near Edna Mall", 8.9960, 38.7869},
		{ph2, "Piazza area, Hawassa", 7.0621, 38.4764},
		{more[0], "Piassa, Churchill Avenue", 9.0352, 38.7525},
		{more[1], "Kazanchis, near UNECA", 9.0175, 38.7665},
		{more[2], "Megenagna roundabout", 9.0205, 38.8010},
		{more[3], "CMC Road, near Michael Church", 9.0225, 38.8440},
	}
	for _, l := range locations {
		if err := place(l.o, l.address, l.lat, l.lng); err != nil {
			return err
		}
	}
	patientSession, err := a.RegisterPatient(ctx, app.RegisterPatientInput{FullName: "Sara Tesfaye", Email: "patient@meditrack.local", Phone: "+251 912 345 678", Password: demoPassword}, "seed")
	if err != nil {
		return err
	}
	patient := &app.Actor{UserID: patientSession.Me.User.ID, Role: app.RolePatient}

	// Catalog and batches.
	today := time.Now()
	type product struct {
		in      app.ProductInput
		batches []struct {
			number string
			qty    int
			made   int // months ago
			life   int // shelf life in months
		}
	}
	type batchSpec = struct {
		number string
		qty    int
		made   int
		life   int
	}
	catalog := []product{
		{app.ProductInput{Name: "Amoxil", GenericName: "Amoxicillin", Strength: "500 mg", DosageForm: "Capsule", Category: "Antibiotic", PackSize: "2 × 10 capsules", RequiresPrescription: true},
			[]batchSpec{{"AMX-2508", 400, 2, 24}, {"AMX-2411", 200, 11, 13}}},
		{app.ProductInput{Name: "Panadol", GenericName: "Paracetamol", Strength: "500 mg", DosageForm: "Tablet", Category: "Analgesic", PackSize: "10 tablets"},
			[]batchSpec{{"PCM-2509", 600, 1, 36}}},
		{app.ProductInput{Name: "Coartem", GenericName: "Artemether / Lumefantrine", Strength: "20/120 mg", DosageForm: "Tablet", Category: "Antimalarial", PackSize: "24 tablets", RequiresPrescription: true},
			[]batchSpec{{"ART-2507", 300, 3, 24}}},
		{app.ProductInput{Name: "Glucophage", GenericName: "Metformin", Strength: "850 mg", DosageForm: "Tablet", Category: "Antidiabetic", PackSize: "30 tablets", RequiresPrescription: true},
			[]batchSpec{{"MET-2506", 250, 4, 36}}},
	}
	batchIDs := map[string]string{}
	productIDs := map[string]string{}
	for _, p := range catalog {
		created, err := a.CreateProduct(ctx, mfr.actor, p.in)
		if err != nil {
			return err
		}
		productIDs[p.in.Name] = created.ID
		for _, b := range p.batches {
			made := today.AddDate(0, -b.made, 0)
			bd, err := a.CreateBatch(ctx, mfr.actor, app.BatchInput{ProductID: created.ID, BatchNumber: b.number, Quantity: b.qty,
				ManufacturedOn: made.Format("2006-01-02"), ExpiresOn: made.AddDate(0, b.life, 0).Format("2006-01-02")})
			if err != nil {
				return err
			}
			batchIDs[b.number] = bd.ID
		}
	}

	ship := func(from *org, to *org, lines map[string]int) (string, error) {
		in := app.ShipmentInput{ToOrgID: to.id, Notes: "Demo shipment"}
		for number, qty := range lines {
			in.Lines = append(in.Lines, app.ShipmentLineInput{BatchID: batchIDs[number], Quantity: qty})
		}
		s, err := a.CreateShipment(ctx, from.actor, in)
		if err != nil {
			return "", err
		}
		return s.ID, nil
	}
	receive := func(o *org, id string) error { _, err := a.ReceiveShipment(ctx, o.actor, id); return err }

	// Manufacturer -> importer -> pharmacies.
	s1, err := ship(mfr, imp, map[string]int{"AMX-2508": 200, "PCM-2509": 300, "ART-2507": 150, "AMX-2411": 100})
	if err != nil {
		return err
	}
	if err := receive(imp, s1); err != nil {
		return err
	}
	s2, err := ship(imp, ph1, map[string]int{"AMX-2508": 60, "PCM-2509": 120, "ART-2507": 40, "AMX-2411": 30})
	if err != nil {
		return err
	}
	if err := receive(ph1, s2); err != nil {
		return err
	}
	s3, err := ship(mfr, ph2, map[string]int{"MET-2506": 50, "PCM-2509": 80})
	if err != nil {
		return err
	}
	if err := receive(ph2, s3); err != nil {
		return err
	}
	// One shipment left in transit so the pharmacy has something to receive.
	if _, err := ship(imp, ph1, map[string]int{"PCM-2509": 50, "ART-2507": 20}); err != nil {
		return err
	}

	for i, o := range more {
		id, err := ship(mfr, o, map[string]int{"PCM-2509": 30 + i*5, "AMX-2508": 15 + i*3, "ART-2507": 10, "MET-2506": 12})
		if err != nil {
			return err
		}
		if err := receive(o, id); err != nil {
			return err
		}
	}

	// Pharmacy settings and sales.
	for name, min := range map[string]int{"Amoxil": 40, "Coartem": 30, "Panadol": 50} {
		m := min
		if err := a.SetThreshold(ctx, ph1.actor, productIDs[name], app.ThresholdInput{MinQuantity: &m}); err != nil {
			return err
		}
	}
	for name, qty := range map[string]int{"Panadol": 25, "Amoxil": 22, "Coartem": 12} {
		if _, err := a.Dispense(ctx, ph1.actor, app.DispenseInput{ProductID: productIDs[name], Quantity: qty}); err != nil {
			return err
		}
	}
	if _, err := a.Dispense(ctx, ph2.actor, app.DispenseInput{ProductID: productIDs["Glucophage"], Quantity: 8}); err != nil {
		return err
	}

	// A recall, so recall handling is visible everywhere.
	if _, err := a.RecallBatch(ctx, mfr.actor, batchIDs["AMX-2411"], app.RecallInput{Reason: "Dissolution out of specification in 12-month stability test"}); err != nil {
		return err
	}

	// Marketplace: wholesale prices for suppliers, retail prices for pharmacies.
	prices := []struct {
		org   *org
		items map[string]float64
	}{
		{mfr, map[string]float64{"Amoxil": 95, "Panadol": 18, "Coartem": 140, "Glucophage": 60}},
		{imp, map[string]float64{"Amoxil": 110, "Panadol": 22, "Coartem": 160}},
		{ph1, map[string]float64{"Amoxil": 150, "Panadol": 35, "Coartem": 210}},
		{ph2, map[string]float64{"Panadol": 30, "Glucophage": 120}},
		{more[0], map[string]float64{"Panadol": 32, "Amoxil": 145, "Coartem": 205, "Glucophage": 115}},
		{more[1], map[string]float64{"Panadol": 38, "Amoxil": 155, "Coartem": 199, "Glucophage": 125}},
		{more[2], map[string]float64{"Panadol": 33, "Amoxil": 148, "Glucophage": 118}},
		{more[3], map[string]float64{"Panadol": 36, "Coartem": 215, "Glucophage": 110}},
	}
	for _, p := range prices {
		for name, price := range p.items {
			if err := a.SetListing(ctx, p.org.actor, productIDs[name], app.ListingInput{UnitPrice: price, Listed: true}); err != nil {
				return fmt.Errorf("list %s: %w", name, err)
			}
		}
	}
	// A patient reservation waiting for the pharmacy, and one ready for pickup.
	if _, err := a.CreateOrder(ctx, patient, app.OrderInput{SellerID: ph1.id, Note: "I'll come after work",
		Items: []app.OrderItemInput{{ProductID: productIDs["Panadol"], Quantity: 2}}}); err != nil {
		return err
	}
	ready, err := a.CreateOrder(ctx, patient, app.OrderInput{SellerID: ph2.id,
		Items: []app.OrderItemInput{{ProductID: productIDs["Glucophage"], Quantity: 1}}})
	if err != nil {
		return err
	}
	if _, err := a.AcceptOrder(ctx, ph2.actor, ready.ID); err != nil {
		return err
	}
	// A pharmacy restocking from the importer.
	if _, err := a.CreateOrder(ctx, ph2.actor, app.OrderInput{SellerID: imp.id, Note: "Weekly restock",
		Items: []app.OrderItemInput{{ProductID: productIDs["Amoxil"], Quantity: 20}, {ProductID: productIDs["Coartem"], Quantity: 10}}}); err != nil {
		return err
	}

	// A public counterfeit report.
	if _, err := a.CreateReport(ctx, nil, app.ReportInput{ProductName: "Coartem 20/120 mg", Place: "Street vendor near Merkato",
		Description: "No QR code on the box and the tablets are a different colour from usual."}); err != nil {
		return err
	}

	// Print a few dispensed codes for trying out verification.
	rows, err := pool.Query(ctx, `SELECT u.code FROM units u JOIN batches b ON b.id = u.batch_id
		WHERE u.status = 'dispensed' AND b.recalled_at IS NULL ORDER BY b.batch_number, u.serial LIMIT 3`)
	if err != nil {
		return err
	}
	var codes []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return err
		}
		codes = append(codes, app.FormatCode(c))
	}
	var recalled string
	if err := pool.QueryRow(ctx, `SELECT u.code FROM units u WHERE u.batch_id = $1 AND u.status = 'in_stock' LIMIT 1`, batchIDs["AMX-2411"]).Scan(&recalled); err != nil {
		return err
	}

	fmt.Println("Demo data created. Password for every demo account:", demoPassword)
	fmt.Println("  admin:        ", adminEmail, "(password from ADMIN_PASSWORD if set)")
	fmt.Println("  manufacturer:  manufacturer@meditrack.local")
	fmt.Println("  importer:      importer@meditrack.local")
	fmt.Println("  pharmacy:      pharmacy@meditrack.local  (also pharmacy2@…)")
	fmt.Println("  pending org:   pending@meditrack.local")
	fmt.Println("  patient:       patient@meditrack.local")
	fmt.Println("Try verifying these genuine, dispensed packs:", codes)
	fmt.Println("And this recalled one:", app.FormatCode(recalled))
	return nil
}
