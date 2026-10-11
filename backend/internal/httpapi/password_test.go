package httpapi_test

import (
	"regexp"
	"testing"
)

func TestAdminPasswordReset(t *testing.T) {
	srv := setup(t)
	admin := newClient(t, srv)
	admin.must(200, "POST", "/auth/login", obj{"email": "admin@example.com", "password": "admin-password"})

	patient := newClient(t, srv)
	reg := patient.must(201, "POST", "/auth/register/patient", obj{"full_name": "Hana", "email": "hana@example.com", "password": "password123"})
	userID := str(reg, "me", "user", "id")
	if str(reg, "me", "user", "must_change_password") != "false" {
		t.Fatal("new accounts must not be forced to change password")
	}

	// Only admins can reset, and not their own password.
	patient.must(403, "POST", "/admin/users/"+userID+"/reset-password", nil)
	me := admin.must(200, "GET", "/auth/me", nil)
	admin.must(409, "POST", "/admin/users/"+str(me, "user", "id")+"/reset-password", nil)

	out := admin.must(200, "POST", "/admin/users/"+userID+"/reset-password", nil)
	temp := str(out, "temporary_password")
	if !regexp.MustCompile(`^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$`).MatchString(temp) {
		t.Fatalf("unexpected temporary password format %q", temp)
	}

	// The reset signs the patient out everywhere; the old password no longer works.
	patient.must(401, "GET", "/auth/me", nil)
	fresh := newClient(t, srv)
	fresh.must(401, "POST", "/auth/login", obj{"email": "hana@example.com", "password": "password123"})
	login := fresh.must(200, "POST", "/auth/login", obj{"email": "hana@example.com", "password": temp})
	if str(login, "me", "user", "must_change_password") != "true" {
		t.Fatal("after a reset the user must be asked to change the password")
	}

	// Reusing the temporary password is refused; a new one clears the flag.
	fresh.must(422, "PUT", "/auth/password", obj{"current_password": temp, "new_password": temp})
	fresh.must(204, "PUT", "/auth/password", obj{"current_password": temp, "new_password": "a-new-password"})
	if str(fresh.must(200, "GET", "/auth/me", nil), "user", "must_change_password") != "false" {
		t.Fatal("changing the password must clear the flag")
	}
	newClient(t, srv).must(200, "POST", "/auth/login", obj{"email": "hana@example.com", "password": "a-new-password"})

	audit := admin.must(200, "GET", "/admin/audit?q=password", nil)
	if len(audit["items"].([]any)) < 2 {
		t.Fatalf("expected reset and change in the audit log, got %v", audit["items"])
	}
}
