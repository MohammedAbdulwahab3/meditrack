package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/meditrack/backend/internal/app"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	var appErr *app.Error
	if errors.As(err, &appErr) {
		writeJSON(w, appErr.Status, map[string]any{"error": appErr})
		return
	}
	slog.Error("request failed", "method", r.Method, "path", r.URL.Path, "err", err,
		"request_id", middleware.GetReqID(r.Context()))
	writeJSON(w, http.StatusInternalServerError, map[string]any{"error": app.Error{
		Code: "internal", Message: "Something went wrong on our side. Please try again.",
	}})
}

// handler adapts a function returning (status, body, error) into an http.HandlerFunc.
type handlerFunc func(w http.ResponseWriter, r *http.Request) (int, any, error)

func h(fn handlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		status, body, err := fn(w, r)
		if err != nil {
			writeError(w, r, err)
			return
		}
		if body == nil {
			w.WriteHeader(status)
			return
		}
		writeJSON(w, status, body)
	}
}

func decode(r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(nil, r.Body, 1<<20)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		return &app.Error{Status: http.StatusBadRequest, Code: "bad_json", Message: "Request body must be valid JSON."}
	}
	return nil
}

func pageParams(r *http.Request) app.PageParams {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	return app.PageParams{Limit: limit, Offset: offset}
}
