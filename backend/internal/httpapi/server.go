// Package httpapi exposes the app package over a JSON HTTP API under /api.
package httpapi

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/meditrack/backend/internal/app"
)

type Server struct {
	app          *app.App
	secureCookie bool
	trustProxy   bool
	ipHeader     string
	authLimit    *limiter
	verifyLimit  *limiter
	reportLimit  *limiter
}

type Options struct {
	SecureCookies bool
	TrustProxy    bool
	// ClientIPHeader, with TrustProxy, names a header the edge proxy sets to the client IP.
	ClientIPHeader string
}

func New(a *app.App, opts Options) *Server {
	return &Server{
		app:          a,
		secureCookie: opts.SecureCookies,
		trustProxy:   opts.TrustProxy,
		ipHeader:     opts.ClientIPHeader,
		authLimit:    newLimiter(10, 10),
		verifyLimit:  newLimiter(60, 30),
		reportLimit:  newLimiter(5, 5),
	}
}

func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	// No middleware.RealIP: forwarded headers are only trusted via Options.TrustProxy (see clientIP).
	r.Use(middleware.RequestID, s.accessLog, middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(securityHeaders)

	r.Route("/api", func(r chi.Router) {
		r.Use(s.identify)
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		})

		// Public
		r.With(s.limit(s.authLimit)).Post("/auth/register/patient", h(s.registerPatient))
		r.With(s.limit(s.authLimit)).Post("/auth/register/business", h(s.registerBusiness))
		r.With(s.limit(s.authLimit)).Post("/auth/login", h(s.login))
		r.Post("/auth/logout", h(s.logout))
		r.With(s.limit(s.verifyLimit)).Get("/verify/{code}", h(s.verify))
		r.With(s.limit(s.reportLimit)).Post("/reports", h(s.createReport))
		r.With(s.limit(s.verifyLimit)).Get("/market/offers", h(s.offers))
		r.With(s.limit(s.verifyLimit)).Get("/market/pharmacies", h(s.nearbyPharmacies))

		// Signed in
		r.Group(func(r chi.Router) {
			r.Use(requireAuth)

			r.Get("/auth/me", h(s.me))
			r.Put("/auth/profile", h(s.updateProfile))
			r.Put("/auth/password", h(s.changePassword))

			r.Get("/me/scans", h(s.myScans))
			r.Get("/me/reports", h(s.myReports))

			r.Put("/org", h(s.updateOrg))
			r.Get("/org/members", h(s.listMembers))
			r.Post("/org/members", h(s.addMember))
			r.Get("/directory", h(s.directory))

			r.Get("/products", h(s.listProducts))
			r.Post("/products", h(s.createProduct))
			r.Get("/products/{id}", h(s.getProduct))
			r.Put("/products/{id}", h(s.updateProduct))
			r.Post("/products/{id}/status", h(s.setProductStatus))

			r.Get("/batches", h(s.listBatches))
			r.Post("/batches", h(s.createBatch))
			r.Get("/batches/{id}", h(s.getBatch))
			r.Get("/batches/{id}/labels", h(s.batchLabels))
			r.Post("/batches/{id}/recall", h(s.recallBatch))

			r.Get("/shipments", h(s.listShipments))
			r.Post("/shipments", h(s.createShipment))
			r.Get("/shipments/{id}", h(s.getShipment))
			r.Post("/shipments/{id}/receive", h(s.receiveShipment))
			r.Post("/shipments/{id}/reject", h(s.rejectShipment))
			r.Post("/shipments/{id}/cancel", h(s.cancelShipment))

			r.Get("/inventory", h(s.inventory))
			r.Put("/inventory/thresholds/{productID}", h(s.setThreshold))
			r.Get("/dispense", h(s.listDispensed))
			r.Post("/dispense", h(s.dispense))

			r.Get("/listings", h(s.myListings))
			r.Put("/listings/{productID}", h(s.setListing))

			r.Get("/orders", h(s.listOrders))
			r.Post("/orders", h(s.createOrder))
			r.Get("/orders/{id}", h(s.getOrder))
			r.Post("/orders/{id}/accept", h(s.acceptOrder))
			r.Post("/orders/{id}/reject", h(s.rejectOrder))
			r.Post("/orders/{id}/cancel", h(s.cancelOrder))
			r.Post("/orders/{id}/complete", h(s.completeOrder))

			r.Get("/notifications", h(s.listNotifications))
			r.Get("/notifications/unread-count", h(s.unreadCount))
			r.Post("/notifications/read-all", h(s.readAll))
			r.Post("/notifications/{id}/read", h(s.readOne))

			r.Route("/admin", func(r chi.Router) {
				r.Get("/stats", h(s.adminStats))
				r.Get("/organizations", h(s.adminOrganizations))
				r.Post("/organizations/{id}/status", h(s.adminOrgStatus))
				r.Get("/users", h(s.adminUsers))
				r.Post("/users/{id}/active", h(s.adminUserActive))
				r.Post("/users/{id}/reset-password", h(s.adminResetPassword))
				r.Get("/reports", h(s.adminReports))
				r.Put("/reports/{id}", h(s.adminUpdateReport))
				r.Get("/audit", h(s.adminAudit))
			})
		})

		r.NotFound(func(w http.ResponseWriter, r *http.Request) {
			writeError(w, r, &app.Error{Status: http.StatusNotFound, Code: "not_found", Message: "No such endpoint."})
		})
	})
	return r
}

func result(v any, err error) (int, any, error) {
	if err != nil {
		return 0, nil, err
	}
	return http.StatusOK, v, nil
}

func created(v any, err error) (int, any, error) {
	if err != nil {
		return 0, nil, err
	}
	return http.StatusCreated, v, nil
}
