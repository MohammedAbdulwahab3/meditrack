package httpapi_test

import (
	"testing"
	"time"
)

func TestMarketplaceFlow(t *testing.T) {
	srv := setup(t)
	admin := newClient(t, srv)
	admin.must(200, "POST", "/auth/login", obj{"email": "admin@example.com", "password": "admin-password"})
	mfr, mfrOrg := registerBusiness(t, srv, "manufacturer", "Market Pharma")
	phA, phAOrg := registerBusiness(t, srv, "pharmacy", "Alpha Pharmacy")
	phB, phBOrg := registerBusiness(t, srv, "pharmacy", "Beta Pharmacy")
	for _, id := range []string{mfrOrg, phAOrg, phBOrg} {
		admin.must(200, "POST", "/admin/organizations/"+id+"/status", obj{"status": "active"})
	}
	patient := newClient(t, srv)
	patient.must(201, "POST", "/auth/register/patient", obj{"full_name": "Abel", "email": "abel@example.com", "password": "password123"})
	patient2 := newClient(t, srv)
	patient2.must(201, "POST", "/auth/register/patient", obj{"full_name": "Hiwot", "email": "hiwot@example.com", "password": "password123"})
	public := newClient(t, srv)
	public.csrf = false

	p := mfr.must(201, "POST", "/products", obj{"name": "Zinc", "generic_name": "Zinc sulfate", "strength": "20 mg", "dosage_form": "Tablet"})
	productID := str(p, "id")
	today := time.Now()
	mfr.must(201, "POST", "/batches", obj{"product_id": productID, "batch_number": "ZN-1", "quantity": 20,
		"manufactured_on": today.Format("2006-01-02"), "expires_on": today.AddDate(1, 0, 0).Format("2006-01-02")})

	// Sellers can only price what they make or hold.
	phB.must(403, "PUT", "/listings/"+productID, obj{"unit_price": 12, "listed": true})
	mfr.must(422, "PUT", "/listings/"+productID, obj{"unit_price": 0, "listed": true})
	mfr.must(204, "PUT", "/listings/"+productID, obj{"unit_price": 10, "listed": true})

	// Supply offers are for approved pharmacies only.
	patient.must(403, "GET", "/market/offers?side=supply", nil)
	supply := phA.must(200, "GET", "/market/offers?side=supply&q=zinc", nil)
	offers := supply["_"].([]any)
	if len(offers) != 1 || str(offers[0], "available") != "20" || str(offers[0], "seller", "name") != "Market Pharma" {
		t.Fatalf("unexpected supply offers: %v", supply)
	}
	if retail := public.must(200, "GET", "/market/offers?side=retail", nil); len(retail["_"].([]any)) != 0 {
		t.Fatalf("no pharmacy has stock yet: %v", retail)
	}

	// Wholesale: order -> accept (ships FEFO) -> receive -> delivered.
	phA.must(422, "POST", "/orders", obj{"seller_id": mfrOrg, "items": []obj{{"product_id": productID, "quantity": 100}}})
	po := phA.must(201, "POST", "/orders", obj{"seller_id": mfrOrg, "items": []obj{{"product_id": productID, "quantity": 8}}})
	poID := str(po, "id")
	if str(po, "kind") != "wholesale" || str(po, "total") != "80" {
		t.Fatalf("unexpected purchase order: %v", po)
	}
	phB.must(404, "GET", "/orders/"+poID, nil)
	phA.must(404, "POST", "/orders/"+poID+"/accept", nil) // buyers can't accept their own order
	accepted := mfr.must(200, "POST", "/orders/"+poID+"/accept", nil)
	if str(accepted, "status") != "accepted" || accepted["shipment_id"] == nil {
		t.Fatalf("accept should ship: %v", accepted)
	}
	ship := phA.must(200, "GET", "/shipments/"+str(accepted, "shipment_id"), nil)
	if str(ship, "total_units") != "8" {
		t.Fatalf("shipment should carry 8 packs: %v", ship)
	}
	phA.must(200, "POST", "/shipments/"+str(accepted, "shipment_id")+"/receive", nil)
	if o := phA.must(200, "GET", "/orders/"+poID, nil); str(o, "status") != "delivered" {
		t.Fatalf("receiving the shipment should deliver the order: %v", o)
	}

	// A declined purchase order needs a reason.
	po2 := phA.must(201, "POST", "/orders", obj{"seller_id": mfrOrg, "items": []obj{{"product_id": productID, "quantity": 2}}})
	mfr.must(422, "POST", "/orders/"+str(po2, "id")+"/reject", obj{"reason": ""})
	if o := mfr.must(200, "POST", "/orders/"+str(po2, "id")+"/reject", obj{"reason": "Minimum order is 10 packs"}); str(o, "status") != "rejected" {
		t.Fatalf("expected rejected: %v", o)
	}

	// Retail: the pharmacy lists, patients see it publicly.
	phA.must(204, "PUT", "/listings/"+productID, obj{"unit_price": 15.5, "listed": true})
	retail := public.must(200, "GET", "/market/offers?side=retail&q=zinc", nil)["_"].([]any)
	if len(retail) != 1 || str(retail[0], "available") != "8" || str(retail[0], "unit_price") != "15.5" {
		t.Fatalf("unexpected retail offers: %v", retail)
	}
	phA.must(422, "POST", "/orders", obj{"seller_id": phBOrg, "items": []obj{{"product_id": productID, "quantity": 1}}}) // pharmacies buy from suppliers, not other pharmacies

	o1 := patient.must(201, "POST", "/orders", obj{"seller_id": phAOrg, "items": []obj{{"product_id": productID, "quantity": 5}}, "note": "Pick up after 5pm"})
	o2 := patient2.must(201, "POST", "/orders", obj{"seller_id": phAOrg, "items": []obj{{"product_id": productID, "quantity": 5}}})
	patient2.must(404, "GET", "/orders/"+str(o1, "id"), nil)

	// Confirming holds stock: the second confirmation and walk-in sales can't take it.
	if c := phA.must(200, "POST", "/orders/"+str(o1, "id")+"/accept", nil); str(c, "status") != "confirmed" {
		t.Fatalf("expected confirmed: %v", c)
	}
	if r := public.must(200, "GET", "/market/offers?side=retail", nil)["_"].([]any); str(r[0], "available") != "3" {
		t.Fatalf("held stock must not be offered: %v", r)
	}
	phA.must(409, "POST", "/orders/"+str(o2, "id")+"/accept", nil)
	phA.must(422, "POST", "/dispense", obj{"product_id": productID, "quantity": 4})
	phA.must(200, "POST", "/dispense", obj{"product_id": productID, "quantity": 3})

	// Pickup: specific packs are handed over and the patient can verify them.
	done := phA.must(200, "POST", "/orders/"+str(o1, "id")+"/complete", nil)
	packs := done["packs"].([]any)
	if str(done, "status") != "completed" || len(packs) != 5 {
		t.Fatalf("completion should hand over 5 packs: %v", done)
	}
	mine := patient.must(200, "GET", "/orders/"+str(o1, "id"), nil)
	v := public.must(200, "GET", "/verify/"+str(mine["packs"].([]any)[0], "code"), nil)
	if str(v, "status") != "genuine" || str(v, "dispensed_by", "name") != "Alpha Pharmacy" {
		t.Fatalf("handed-over pack should verify as genuine: %v", v)
	}
	patient.must(409, "POST", "/orders/"+str(o1, "id")+"/cancel", nil)
	patient2.must(404, "POST", "/orders/"+str(o1, "id")+"/cancel", nil)
	if c := patient2.must(200, "POST", "/orders/"+str(o2, "id")+"/cancel", nil); str(c, "status") != "cancelled" {
		t.Fatalf("expected cancelled: %v", c)
	}

	// Sold out: no offers, and new orders are refused.
	if r := public.must(200, "GET", "/market/offers?side=retail", nil)["_"].([]any); len(r) != 0 {
		t.Fatalf("sold-out stock must disappear: %v", r)
	}
	patient.must(422, "POST", "/orders", obj{"seller_id": phAOrg, "items": []obj{{"product_id": productID, "quantity": 1}}})

	// Order lists by side.
	if l := patient.must(200, "GET", "/orders", nil); str(l, "total") != "1" {
		t.Fatalf("patient should see one order: %v", l)
	}
	if l := phA.must(200, "GET", "/orders?side=selling", nil); str(l, "total") != "2" {
		t.Fatalf("pharmacy sold 2 orders: %v", l)
	}
	if l := phA.must(200, "GET", "/orders?side=buying", nil); str(l, "total") != "2" {
		t.Fatalf("pharmacy bought 2 orders: %v", l)
	}
}

func TestNearbyPharmacies(t *testing.T) {
	srv := setup(t)
	admin := newClient(t, srv)
	admin.must(200, "POST", "/auth/login", obj{"email": "admin@example.com", "password": "admin-password"})
	bole, boleOrg := registerBusiness(t, srv, "pharmacy", "Bole Pharmacy")
	piassa, piassaOrg := registerBusiness(t, srv, "pharmacy", "Piassa Pharmacy")
	_, hawassaOrg := registerBusiness(t, srv, "pharmacy", "Hawassa Pharmacy") // no location set
	for _, id := range []string{boleOrg, piassaOrg, hawassaOrg} {
		admin.must(200, "POST", "/admin/organizations/"+id+"/status", obj{"status": "active"})
	}
	bole.must(422, "PUT", "/org", obj{"address": "Bole Rd", "latitude": 8.99})
	bole.must(422, "PUT", "/org", obj{"address": "Bole Rd", "latitude": 91, "longitude": 38.78})
	org := bole.must(200, "PUT", "/org", obj{"address": "Bole Rd", "latitude": 8.9960, "longitude": 38.7869})
	if str(org, "latitude") != "8.996" {
		t.Fatalf("location not saved: %v", org)
	}
	piassa.must(200, "PUT", "/org", obj{"address": "Piassa", "latitude": 9.0350, "longitude": 38.7520})

	public := newClient(t, srv)
	public.csrf = false
	// Standing near Piassa: Piassa first, then Bole, then the pharmacy without a location.
	list := public.must(200, "GET", "/market/pharmacies?lat=9.0300&lng=38.7500", nil)["_"].([]any)
	if len(list) != 3 || str(list[0], "name") != "Piassa Pharmacy" || str(list[1], "name") != "Bole Pharmacy" || list[2].(map[string]any)["distance_km"] != nil {
		t.Fatalf("unexpected order: %v", list)
	}
	if d := list[1].(map[string]any)["distance_km"].(float64); d < 5 || d > 7 {
		t.Fatalf("Piassa→Bole should be about 6 km, got %.2f", d)
	}
	// Without a location, results still come back (alphabetical among equals).
	if all := public.must(200, "GET", "/market/pharmacies", nil)["_"].([]any); len(all) != 3 {
		t.Fatalf("expected all pharmacies: %v", all)
	}
}
