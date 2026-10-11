package httpapi

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/meditrack/backend/internal/app"
)

// ---- Auth ----

func (s *Server) setSessionCookie(w http.ResponseWriter, sess *app.Session) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: sess.Token, Path: "/", Expires: sess.ExpiresAt,
		HttpOnly: true, Secure: s.secureCookie, SameSite: http.SameSiteLaxMode,
	})
}

// sessionResponse returns the profile, plus the raw token for non-browser clients that ask for it.
func (s *Server) sessionResponse(w http.ResponseWriter, r *http.Request, status int, sess *app.Session, err error) (int, any, error) {
	if err != nil {
		return 0, nil, err
	}
	s.setSessionCookie(w, sess)
	body := map[string]any{"me": sess.Me, "expires_at": sess.ExpiresAt}
	if r.Header.Get("X-Client") == "mobile" {
		body["token"] = sess.Token
	}
	return status, body, nil
}

func (s *Server) registerPatient(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.RegisterPatientInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	sess, err := s.app.RegisterPatient(r.Context(), in, r.UserAgent())
	return s.sessionResponse(w, r, http.StatusCreated, sess, err)
}

func (s *Server) registerBusiness(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.RegisterBusinessInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	sess, err := s.app.RegisterBusiness(r.Context(), in, r.UserAgent())
	return s.sessionResponse(w, r, http.StatusCreated, sess, err)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.LoginInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	sess, err := s.app.Login(r.Context(), in, r.UserAgent())
	return s.sessionResponse(w, r, http.StatusOK, sess, err)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) (int, any, error) {
	if token, _ := sessionToken(r); token != "" {
		if err := s.app.Logout(r.Context(), token); err != nil {
			return 0, nil, err
		}
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, Secure: s.secureCookie, SameSite: http.SameSiteLaxMode})
	return http.StatusNoContent, nil, nil
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.GetMe(r.Context(), actorFrom(r).UserID))
}

func (s *Server) updateProfile(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.UpdateProfileInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.UpdateProfile(r.Context(), actorFrom(r), in))
}

func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.ChangePasswordInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	if err := s.app.ChangePassword(r.Context(), actorFrom(r), tokenFrom(r), in); err != nil {
		return 0, nil, err
	}
	return http.StatusNoContent, nil, nil
}

// ---- Verification & reports ----

func (s *Server) verify(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.Verify(r.Context(), chi.URLParam(r, "code"), app.ScanContext{
		Actor: actorFrom(r), ClientIP: s.clientIP(r), UserAgent: r.UserAgent(),
	}))
}

func (s *Server) createReport(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.ReportInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return created(s.app.CreateReport(r.Context(), actorFrom(r), in))
}

func (s *Server) myScans(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.MyScans(r.Context(), actorFrom(r), pageParams(r)))
}

func (s *Server) myReports(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.MyReports(r.Context(), actorFrom(r)))
}

// ---- Organization ----

func (s *Server) updateOrg(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.OrgContactInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.UpdateOwnOrganization(r.Context(), actorFrom(r), in))
}

func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.ListMembers(r.Context(), actorFrom(r)))
}

func (s *Server) addMember(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.AddMemberInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return created(s.app.AddMember(r.Context(), actorFrom(r), in))
}

func (s *Server) directory(w http.ResponseWriter, r *http.Request) (int, any, error) {
	q := r.URL.Query()
	return result(s.app.Directory(r.Context(), actorFrom(r), q.Get("type"), q.Get("q")))
}

// ---- Products ----

func (s *Server) listProducts(w http.ResponseWriter, r *http.Request) (int, any, error) {
	q := r.URL.Query()
	return result(s.app.ListProducts(r.Context(), actorFrom(r), app.ProductFilter{
		PageParams: pageParams(r), Q: q.Get("q"), Status: q.Get("status"), ManufacturerID: q.Get("manufacturer_id"),
	}))
}

func (s *Server) createProduct(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.ProductInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return created(s.app.CreateProduct(r.Context(), actorFrom(r), in))
}

func (s *Server) getProduct(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.GetProduct(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}

func (s *Server) updateProduct(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.ProductInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.UpdateProduct(r.Context(), actorFrom(r), chi.URLParam(r, "id"), in))
}

func (s *Server) setProductStatus(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.StatusInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.SetProductStatus(r.Context(), actorFrom(r), chi.URLParam(r, "id"), in))
}

// ---- Batches ----

func (s *Server) listBatches(w http.ResponseWriter, r *http.Request) (int, any, error) {
	q := r.URL.Query()
	return result(s.app.ListBatches(r.Context(), actorFrom(r), app.BatchFilter{
		PageParams: pageParams(r), ProductID: q.Get("product_id"), Q: q.Get("q"), State: q.Get("state"),
	}))
}

func (s *Server) createBatch(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.BatchInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return created(s.app.CreateBatch(r.Context(), actorFrom(r), in))
}

func (s *Server) getBatch(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.GetBatch(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}

func (s *Server) batchLabels(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.BatchLabels(r.Context(), actorFrom(r), chi.URLParam(r, "id"), pageParams(r)))
}

func (s *Server) recallBatch(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.RecallInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.RecallBatch(r.Context(), actorFrom(r), chi.URLParam(r, "id"), in))
}

// ---- Shipments ----

func (s *Server) listShipments(w http.ResponseWriter, r *http.Request) (int, any, error) {
	q := r.URL.Query()
	return result(s.app.ListShipments(r.Context(), actorFrom(r), app.ShipmentFilter{
		PageParams: pageParams(r), Direction: q.Get("direction"), Status: q.Get("status"),
	}))
}

func (s *Server) createShipment(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.ShipmentInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return created(s.app.CreateShipment(r.Context(), actorFrom(r), in))
}

func (s *Server) getShipment(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.GetShipment(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}

func (s *Server) receiveShipment(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.ReceiveShipment(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}

func (s *Server) rejectShipment(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in struct {
		Reason string `json:"reason"`
	}
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.RejectShipment(r.Context(), actorFrom(r), chi.URLParam(r, "id"), in.Reason))
}

func (s *Server) cancelShipment(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.CancelShipment(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}

// ---- Inventory & dispensing ----

func (s *Server) inventory(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.GetInventory(r.Context(), actorFrom(r)))
}

func (s *Server) setThreshold(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.ThresholdInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	if err := s.app.SetThreshold(r.Context(), actorFrom(r), chi.URLParam(r, "productID"), in); err != nil {
		return 0, nil, err
	}
	return http.StatusNoContent, nil, nil
}

func (s *Server) dispense(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.DispenseInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.Dispense(r.Context(), actorFrom(r), in))
}

func (s *Server) listDispensed(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.ListDispensed(r.Context(), actorFrom(r), pageParams(r)))
}

// ---- Notifications ----

func (s *Server) listNotifications(w http.ResponseWriter, r *http.Request) (int, any, error) {
	unread, _ := strconv.ParseBool(r.URL.Query().Get("unread"))
	return result(s.app.ListNotifications(r.Context(), actorFrom(r), unread, pageParams(r)))
}

func (s *Server) unreadCount(w http.ResponseWriter, r *http.Request) (int, any, error) {
	n, err := s.app.UnreadCount(r.Context(), actorFrom(r))
	return result(map[string]int{"count": n}, err)
}

func (s *Server) readOne(w http.ResponseWriter, r *http.Request) (int, any, error) {
	if err := s.app.MarkRead(r.Context(), actorFrom(r), chi.URLParam(r, "id")); err != nil {
		return 0, nil, err
	}
	return http.StatusNoContent, nil, nil
}

func (s *Server) readAll(w http.ResponseWriter, r *http.Request) (int, any, error) {
	if err := s.app.MarkRead(r.Context(), actorFrom(r), ""); err != nil {
		return 0, nil, err
	}
	return http.StatusNoContent, nil, nil
}

// ---- Admin ----

func (s *Server) adminStats(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.AdminStats(r.Context(), actorFrom(r)))
}

func (s *Server) adminOrganizations(w http.ResponseWriter, r *http.Request) (int, any, error) {
	q := r.URL.Query()
	return result(s.app.AdminListOrganizations(r.Context(), actorFrom(r), app.OrgFilter{
		PageParams: pageParams(r), Status: q.Get("status"), Type: q.Get("type"), Q: q.Get("q"),
	}))
}

func (s *Server) adminOrgStatus(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.StatusInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.AdminSetOrganizationStatus(r.Context(), actorFrom(r), chi.URLParam(r, "id"), in))
}

func (s *Server) adminUsers(w http.ResponseWriter, r *http.Request) (int, any, error) {
	q := r.URL.Query()
	return result(s.app.AdminListUsers(r.Context(), actorFrom(r), app.UserFilter{
		PageParams: pageParams(r), Role: q.Get("role"), Q: q.Get("q"),
	}))
}

func (s *Server) adminUserActive(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.ActiveInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	if err := s.app.AdminSetUserActive(r.Context(), actorFrom(r), chi.URLParam(r, "id"), in); err != nil {
		return 0, nil, err
	}
	return http.StatusNoContent, nil, nil
}

func (s *Server) adminResetPassword(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.AdminResetPassword(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}

func (s *Server) adminReports(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.AdminListReports(r.Context(), actorFrom(r), app.ReportFilter{
		PageParams: pageParams(r), Status: r.URL.Query().Get("status"),
	}))
}

func (s *Server) adminUpdateReport(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.ReportUpdateInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.AdminUpdateReport(r.Context(), actorFrom(r), chi.URLParam(r, "id"), in))
}

func (s *Server) adminAudit(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.AdminAudit(r.Context(), actorFrom(r), r.URL.Query().Get("q"), pageParams(r)))
}

// ---- Marketplace ----

// nearPoint reads optional ?lat=&lng= query parameters.
func nearPoint(r *http.Request) *app.Point {
	lat, err1 := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, err2 := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	if err1 != nil || err2 != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return nil
	}
	return &app.Point{Lat: lat, Lng: lng}
}

func (s *Server) offers(w http.ResponseWriter, r *http.Request) (int, any, error) {
	q := r.URL.Query()
	return result(s.app.Offers(r.Context(), actorFrom(r), app.OfferFilter{
		Side: q.Get("side"), Q: q.Get("q"), City: q.Get("city"), ProductID: q.Get("product_id"), SellerID: q.Get("seller_id"),
		Near: nearPoint(r),
	}))
}

func (s *Server) nearbyPharmacies(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.NearbyPharmacies(r.Context(), nearPoint(r), r.URL.Query().Get("q")))
}

func (s *Server) myListings(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.MyListings(r.Context(), actorFrom(r)))
}

func (s *Server) setListing(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.ListingInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	if err := s.app.SetListing(r.Context(), actorFrom(r), chi.URLParam(r, "productID"), in); err != nil {
		return 0, nil, err
	}
	return http.StatusNoContent, nil, nil
}

func (s *Server) listOrders(w http.ResponseWriter, r *http.Request) (int, any, error) {
	q := r.URL.Query()
	return result(s.app.ListOrders(r.Context(), actorFrom(r), app.OrderFilter{
		PageParams: pageParams(r), Side: q.Get("side"), Status: q.Get("status"),
	}))
}

func (s *Server) createOrder(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in app.OrderInput
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return created(s.app.CreateOrder(r.Context(), actorFrom(r), in))
}

func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.GetOrder(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}

func (s *Server) acceptOrder(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.AcceptOrder(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}

func (s *Server) rejectOrder(w http.ResponseWriter, r *http.Request) (int, any, error) {
	var in struct {
		Reason string `json:"reason"`
	}
	if err := decode(r, &in); err != nil {
		return 0, nil, err
	}
	return result(s.app.RejectOrder(r.Context(), actorFrom(r), chi.URLParam(r, "id"), in.Reason))
}

func (s *Server) cancelOrder(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.CancelOrder(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}

func (s *Server) completeOrder(w http.ResponseWriter, r *http.Request) (int, any, error) {
	return result(s.app.CompleteOrder(r.Context(), actorFrom(r), chi.URLParam(r, "id")))
}
