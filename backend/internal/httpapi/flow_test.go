package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/meditrack/backend/internal/app"
	"github.com/meditrack/backend/internal/db"
	"github.com/meditrack/backend/internal/httpapi"
)

// These tests need a disposable Postgres database; they wipe its public schema.
// Run with: TEST_DATABASE_URL=postgres://meditrack:meditrack@localhost:5433/meditrack?sslmode=disable go test ./...
func setup(t *testing.T) *httptest.Server {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	a := app.New(pool, "test-secret", time.Hour, slog.New(slog.NewTextHandler(io.Discard, nil)))
	if _, err := a.EnsureAdmin(ctx, "admin@example.com", "admin-password", "Admin"); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(httpapi.New(a, httpapi.Options{TrustProxy: true}).Handler())
	t.Cleanup(srv.Close)
	return srv
}

type client struct {
	t    *testing.T
	base string
	http *http.Client
	ip   string
	csrf bool
}

func newClient(t *testing.T, srv *httptest.Server) *client {
	jar, _ := cookiejar.New(nil)
	return &client{t: t, base: srv.URL, http: &http.Client{Jar: jar}, csrf: true}
}

type obj = map[string]any

func (c *client) do(method, path string, body any) (int, obj) {
	c.t.Helper()
	var r io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		r = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, c.base+"/api"+path, r)
	req.Header.Set("Content-Type", "application/json")
	if c.csrf {
		req.Header.Set("X-Requested-With", "test")
	}
	if c.ip != "" {
		req.Header.Set("X-Forwarded-For", c.ip)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	out := obj{}
	raw, _ := io.ReadAll(resp.Body)
	if len(raw) > 0 {
		var v any
		if err := json.Unmarshal(raw, &v); err == nil {
			if m, ok := v.(map[string]any); ok {
				out = m
			} else {
				out["_"] = v
			}
		}
	}
	return resp.StatusCode, out
}

func (c *client) must(want int, method, path string, body any) obj {
	c.t.Helper()
	got, out := c.do(method, path, body)
	if got != want {
		c.t.Fatalf("%s %s: status %d, want %d: %v", method, path, got, want, out)
	}
	return out
}

func str(v any, path ...any) string {
	for _, p := range path {
		switch k := p.(type) {
		case string:
			v = v.(map[string]any)[k]
		case int:
			v = v.([]any)[k]
		}
	}
	return fmt.Sprint(v)
}

func registerBusiness(t *testing.T, srv *httptest.Server, kind, name string) (*client, string) {
	c := newClient(t, srv)
	out := c.must(201, "POST", "/auth/register/business", obj{
		"full_name": name + " Owner", "email": kind + "-" + strings.ReplaceAll(name, " ", "") + "@example.com", "password": "password123",
		"organization": obj{"name": name, "type": kind, "license_number": "LIC-" + name, "country": "Ethiopia", "city": "Addis Ababa"},
	})
	return c, str(out, "me", "organization", "id")
}

func TestSupplyChainFlow(t *testing.T) {
	srv := setup(t)

	admin := newClient(t, srv)
	admin.must(200, "POST", "/auth/login", obj{"email": "admin@example.com", "password": "admin-password"})
	_, bad := admin.do("POST", "/auth/login", obj{"email": "admin@example.com", "password": "wrong"})
	if str(bad, "error", "code") != "invalid_credentials" {
		t.Fatalf("expected invalid_credentials, got %v", bad)
	}

	mfr, mfrOrg := registerBusiness(t, srv, "manufacturer", "Abyssinia Pharma")
	imp, impOrg := registerBusiness(t, srv, "importer", "Horn Imports")
	phA, phAOrg := registerBusiness(t, srv, "pharmacy", "Bole Pharmacy")
	phB, phBOrg := registerBusiness(t, srv, "pharmacy", "Piazza Pharmacy")

	// Pending organizations can't act.
	mfr.must(403, "POST", "/products", obj{"name": "X", "generic_name": "X", "strength": "1mg", "dosage_form": "Tablet"})

	pending := admin.must(200, "GET", "/admin/organizations?status=pending", nil)
	if str(pending, "total") != "4" {
		t.Fatalf("expected 4 pending orgs, got %v", pending["total"])
	}
	for _, id := range []string{mfrOrg, impOrg, phAOrg, phBOrg} {
		org := admin.must(200, "POST", "/admin/organizations/"+id+"/status", obj{"status": "active"})
		if org["trial_ends_at"] == nil {
			t.Fatal("approval should start a trial")
		}
	}
	admin.must(409, "POST", "/admin/organizations/"+mfrOrg+"/status", obj{"status": "rejected", "reason": "late"})

	// Product + batch: one unique code per pack.
	product := mfr.must(201, "POST", "/products", obj{
		"name": "Amoxil", "generic_name": "Amoxicillin", "strength": "500 mg", "dosage_form": "Capsule", "requires_prescription": true,
	})
	productID := str(product, "id")
	mfr.must(422, "POST", "/products", obj{"name": "amoxil", "generic_name": "Amoxicillin", "strength": "500 mg", "dosage_form": "capsule"})
	today := time.Now()
	batch := mfr.must(201, "POST", "/batches", obj{
		"product_id": productID, "batch_number": "AMX-001", "quantity": 20,
		"manufactured_on": today.AddDate(0, -1, 0).Format("2006-01-02"), "expires_on": today.AddDate(2, 0, 0).Format("2006-01-02"),
	})
	batchID := str(batch, "id")
	if str(batch, "distribution", "with_manufacturer") != "20" {
		t.Fatalf("expected 20 units with manufacturer: %v", batch["distribution"])
	}
	labels := mfr.must(200, "GET", "/batches/"+batchID+"/labels?limit=100", nil)
	items := labels["items"].([]any)
	if len(items) != 20 {
		t.Fatalf("expected 20 labels, got %d", len(items))
	}
	code := func(serial int) string { return str(items[serial-1], "code") }
	// Other manufacturers' staff can't see this batch.
	imp.must(403, "GET", "/batches/"+batchID, nil)

	// Manufacturer -> importer (10 packs), importer receives.
	ship1 := mfr.must(201, "POST", "/shipments", obj{"to_org_id": impOrg, "lines": []obj{{"batch_id": batchID, "quantity": 10}}})
	mfr.must(422, "POST", "/shipments", obj{"to_org_id": impOrg, "lines": []obj{{"batch_id": batchID, "quantity": 11}}})
	inv := mfr.must(200, "GET", "/inventory", nil)
	if str(inv, "summary", "total_units") != "10" || str(inv, "summary", "in_transit_out") != "10" {
		t.Fatalf("unexpected manufacturer inventory: %v", inv["summary"])
	}
	phB.must(404, "POST", "/shipments/"+str(ship1, "id")+"/receive", nil)
	mfr.must(403, "POST", "/shipments/"+str(ship1, "id")+"/receive", nil)
	imp.must(200, "POST", "/shipments/"+str(ship1, "id")+"/receive", nil)
	imp.must(409, "POST", "/shipments/"+str(ship1, "id")+"/receive", nil)

	// Importer -> pharmacy A (6 packs). Manufacturers can't ship to manufacturers etc.
	imp.must(422, "POST", "/shipments", obj{"to_org_id": mfrOrg, "lines": []obj{{"batch_id": batchID, "quantity": 1}}})
	ship2 := imp.must(201, "POST", "/shipments", obj{"to_org_id": phAOrg, "lines": []obj{{"batch_id": batchID, "quantity": 6}}})
	phB.must(404, "GET", "/shipments/"+str(ship2, "id"), nil)
	phA.must(200, "POST", "/shipments/"+str(ship2, "id")+"/receive", nil)

	// A rejected shipment returns stock to the sender.
	ship3 := imp.must(201, "POST", "/shipments", obj{"to_org_id": phBOrg, "lines": []obj{{"batch_id": batchID, "quantity": 2}}})
	phB.must(422, "POST", "/shipments/"+str(ship3, "id")+"/reject", obj{"reason": ""})
	phB.must(200, "POST", "/shipments/"+str(ship3, "id")+"/reject", obj{"reason": "Damaged boxes"})
	if inv := imp.must(200, "GET", "/inventory", nil); str(inv, "summary", "total_units") != "4" {
		t.Fatalf("importer should have 4 units back in stock: %v", inv["summary"])
	}
	if inv := phB.must(200, "GET", "/inventory", nil); str(inv, "summary", "total_units") != "0" {
		t.Fatalf("pharmacy B should hold nothing: %v", inv["summary"])
	}

	// Dispensing: threshold, FEFO quantity mode, scan mode with every failure case.
	phA.must(204, "PUT", "/inventory/thresholds/"+productID, obj{"min_quantity": 5})
	imp.must(403, "POST", "/dispense", obj{"product_id": productID, "quantity": 1})
	d1 := phA.must(200, "POST", "/dispense", obj{"product_id": productID, "quantity": 2})
	if str(d1, "dispensed") != "2" || str(d1, "results", 0, "code") != app.FormatCode(code(1)) {
		t.Fatalf("FEFO dispense should take serials 1-2: %v", d1)
	}
	notes := phA.must(200, "GET", "/notifications", nil)
	if str(notes, "items", 0, "kind") != "low_stock" {
		t.Fatalf("expected low stock alert, got %v", notes["items"])
	}
	d2 := phA.must(200, "POST", "/dispense", obj{"codes": []string{
		"https://example.com/v/" + code(3), code(1), code(15), "ZZZZZZZZZZZZ",
	}})
	results := d2["results"].([]any)
	if str(d2, "dispensed") != "1" || str(results[0], "ok") != "true" || str(results[1], "ok") != "false" ||
		str(results[2], "ok") != "false" || str(results[3], "ok") != "false" {
		t.Fatalf("unexpected scan dispense results: %v", d2)
	}

	// Public verification and the pack's journey.
	public := newClient(t, srv)
	public.csrf = false
	v := public.must(200, "GET", "/verify/"+code(3), nil)
	if str(v, "status") != "genuine" {
		t.Fatalf("expected genuine: %v", v)
	}
	var kinds []string
	for _, step := range v["journey"].([]any) {
		kinds = append(kinds, str(step, "kind"))
	}
	if fmt.Sprint(kinds) != "[manufactured shipped received shipped received dispensed]" {
		t.Fatalf("unexpected journey: %v", kinds)
	}
	if str(v, "dispensed_by", "name") != "Bole Pharmacy" {
		t.Fatalf("expected dispensing pharmacy: %v", v["dispensed_by"])
	}
	if nf := public.must(200, "GET", "/verify/ABCD-EFGH-JKMN", nil); str(nf, "status") != "not_found" {
		t.Fatalf("expected not_found: %v", nf)
	}
	// Lowercase and confusable letters are normalised.
	if lower := public.must(200, "GET", "/verify/"+bytesLower(code(4)), nil); str(lower, "status") != "genuine" {
		t.Fatalf("lowercase code should verify: %v", lower)
	}

	// Clone detection: the same code checked from many different devices.
	var last obj
	for i := 1; i <= 3; i++ {
		public.ip = fmt.Sprintf("10.0.0.%d", i)
		last = public.must(200, "GET", "/verify/"+code(3), nil)
	}
	if str(last, "status") != "warning" {
		t.Fatalf("expected clone warning after many distinct checkers: %v", last)
	}
	mfrNotes := mfr.must(200, "GET", "/notifications", nil)
	if str(mfrNotes, "items", 0, "kind") != "suspicious_scans" {
		t.Fatalf("manufacturer should be alerted: %v", mfrNotes["items"])
	}

	// Recall: holders are alerted, verification and dispensing reflect it, shipping is blocked.
	mfr.must(422, "POST", "/batches/"+batchID+"/recall", obj{"reason": ""})
	mfr.must(200, "POST", "/batches/"+batchID+"/recall", obj{"reason": "Contamination found in QA retest"})
	mfr.must(409, "POST", "/batches/"+batchID+"/recall", obj{"reason": "Contamination found in QA retest"})
	if n := phA.must(200, "GET", "/notifications?unread=true", nil); str(n, "items", 0, "kind") != "recall" {
		t.Fatalf("pharmacy should get recall alert: %v", n["items"])
	}
	if rv := public.must(200, "GET", "/verify/"+code(4), nil); str(rv, "status") != "recalled" {
		t.Fatalf("expected recalled: %v", rv)
	}
	if rd := phA.must(200, "POST", "/dispense", obj{"codes": []string{code(4)}}); str(rd, "dispensed") != "0" {
		t.Fatalf("recalled packs must not be dispensed: %v", rd)
	}
	mfr.must(422, "POST", "/shipments", obj{"to_org_id": impOrg, "lines": []obj{{"batch_id": batchID, "quantity": 1}}})

	// CSRF: cookie-authenticated writes need the custom header.
	phA.csrf = false
	phA.must(403, "POST", "/notifications/read-all", nil)
	phA.csrf = true
	phA.must(204, "POST", "/notifications/read-all", nil)
	if n := phA.must(200, "GET", "/notifications/unread-count", nil); str(n, "count") != "0" {
		t.Fatalf("expected no unread: %v", n)
	}

	// Patients: scan history and counterfeit reports reach the admin.
	patient := newClient(t, srv)
	patient.must(201, "POST", "/auth/register/patient", obj{"full_name": "Sara", "email": "sara@example.com", "password": "password123"})
	patient.must(422, "POST", "/auth/register/patient", obj{"full_name": "Sara", "email": "SARA@example.com", "password": "password123"})
	patient.must(200, "GET", "/verify/"+code(3), nil)
	if scans := patient.must(200, "GET", "/me/scans", nil); str(scans, "total") != "1" {
		t.Fatalf("expected one scan in history: %v", scans)
	}
	patient.must(201, "POST", "/reports", obj{"code": code(3), "description": "Seal was broken and tablets look different", "place": "Merkato"})
	patient.must(403, "GET", "/admin/reports", nil)
	reports := admin.must(200, "GET", "/admin/reports", nil)
	if str(reports, "total") != "1" || str(reports, "items", 0, "known_code") != "true" {
		t.Fatalf("admin should see the report: %v", reports)
	}
	admin.must(200, "PUT", "/admin/reports/"+str(reports, "items", 0, "id"), obj{"status": "investigating", "admin_note": "Contacted pharmacy"})
	if n := patient.must(200, "GET", "/notifications", nil); str(n, "items", 0, "kind") != "report_update" {
		t.Fatalf("reporter should hear back: %v", n)
	}

	// Admin oversight.
	stats := admin.must(200, "GET", "/admin/stats", nil)
	if str(stats, "units") != "20" || str(stats, "units_dispensed") != "3" || str(stats, "active_recalls") != "1" {
		t.Fatalf("unexpected stats: %v", stats)
	}
	if audit := admin.must(200, "GET", "/admin/audit?q=batch.recalled", nil); str(audit, "total") != "1" {
		t.Fatalf("recall should be audited: %v", audit)
	}
	admin.must(200, "POST", "/admin/organizations/"+phBOrg+"/status", obj{"status": "suspended", "reason": "License expired"})
	phB.must(403, "GET", "/directory", nil)

	// Deactivated users lose their sessions immediately.
	users := admin.must(200, "GET", "/admin/users?q=sara", nil)
	admin.must(204, "POST", "/admin/users/"+str(users, "items", 0, "id")+"/active", obj{"active": false})
	patient.must(401, "GET", "/auth/me", nil)

	// Logout clears the session.
	mfr.must(204, "POST", "/auth/logout", nil)
	mfr.must(401, "GET", "/auth/me", nil)
}

func bytesLower(s string) string { return string(bytes.ToLower([]byte(s))) }

// Concurrent shipments from the same stock must never double-ship a pack.
func TestConcurrentShipmentsDoNotOversell(t *testing.T) {
	srv := setup(t)
	admin := newClient(t, srv)
	admin.must(200, "POST", "/auth/login", obj{"email": "admin@example.com", "password": "admin-password"})
	mfr, mfrOrg := registerBusiness(t, srv, "manufacturer", "Concurrent Pharma")
	_, phOrg := registerBusiness(t, srv, "pharmacy", "Race Pharmacy")
	for _, id := range []string{mfrOrg, phOrg} {
		admin.must(200, "POST", "/admin/organizations/"+id+"/status", obj{"status": "active"})
	}
	p := mfr.must(201, "POST", "/products", obj{"name": "Para", "generic_name": "Paracetamol", "strength": "500 mg", "dosage_form": "Tablet"})
	today := time.Now()
	b := mfr.must(201, "POST", "/batches", obj{"product_id": str(p, "id"), "batch_number": "P-1", "quantity": 10,
		"manufactured_on": today.Format("2006-01-02"), "expires_on": today.AddDate(1, 0, 0).Format("2006-01-02")})

	const workers = 10
	codes := make(chan int, workers)
	for i := 0; i < workers; i++ {
		go func() {
			status, _ := mfr.do("POST", "/shipments", obj{"to_org_id": phOrg, "lines": []obj{{"batch_id": str(b, "id"), "quantity": 2}}})
			codes <- status
		}()
	}
	okCount := 0
	for i := 0; i < workers; i++ {
		if <-codes == 201 {
			okCount++
		}
	}
	if okCount != 5 {
		t.Fatalf("expected exactly 5 successful shipments of 2 packs from 10, got %d", okCount)
	}
	batch := mfr.must(200, "GET", "/batches/"+str(b, "id"), nil)
	if str(batch, "distribution", "in_transit") != "10" || str(batch, "distribution", "with_manufacturer") != "0" {
		t.Fatalf("unexpected distribution: %v", batch["distribution"])
	}
}
