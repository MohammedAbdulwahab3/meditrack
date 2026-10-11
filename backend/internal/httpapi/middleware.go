package httpapi

import (
	"context"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"

	"github.com/meditrack/backend/internal/app"
)

const sessionCookie = "mt_session"

type ctxKey int

const (
	actorKey ctxKey = iota
	tokenKey
)

func actorFrom(r *http.Request) *app.Actor {
	a, _ := r.Context().Value(actorKey).(*app.Actor)
	return a
}

func tokenFrom(r *http.Request) string {
	t, _ := r.Context().Value(tokenKey).(string)
	return t
}

// sessionToken reads a bearer token (API/mobile clients) or the session cookie (browser).
func sessionToken(r *http.Request) (token string, fromCookie bool) {
	if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimPrefix(h, "Bearer "), false
	}
	if c, err := r.Cookie(sessionCookie); err == nil {
		return c.Value, true
	}
	return "", false
}

// identify attaches the actor when a valid session is present; it never rejects.
func (s *Server) identify(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, fromCookie := sessionToken(r)
		if token != "" {
			// Cookie-authenticated writes must carry a custom header. Browsers won't send it
			// cross-site without a CORS preflight (which we never allow), so this blocks CSRF.
			if fromCookie && r.Method != http.MethodGet && r.Method != http.MethodHead && r.Header.Get("X-Requested-With") == "" {
				writeError(w, r, &app.Error{Status: http.StatusForbidden, Code: "csrf", Message: "Missing X-Requested-With header."})
				return
			}
			if actor, err := s.app.Authenticate(r.Context(), token); err == nil {
				ctx := context.WithValue(r.Context(), actorKey, actor)
				ctx = context.WithValue(ctx, tokenKey, token)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}

func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if actorFrom(r) == nil {
			writeError(w, r, app.ErrUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) clientIP(r *http.Request) string {
	if s.trustProxy {
		if s.ipHeader != "" {
			if ip := strings.TrimSpace(r.Header.Get(s.ipHeader)); ip != "" {
				return ip
			}
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.Split(xff, ",")
			return strings.TrimSpace(parts[len(parts)-1])
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// limiter is a per-client token bucket, keyed by IP.
type limiter struct {
	mu      sync.Mutex
	clients map[string]*client
	rate    rate.Limit
	burst   int
}

type client struct {
	lim  *rate.Limiter
	seen time.Time
}

func newLimiter(perMinute, burst int) *limiter {
	l := &limiter{clients: map[string]*client{}, rate: rate.Limit(float64(perMinute) / 60), burst: burst}
	go func() {
		for range time.Tick(5 * time.Minute) {
			l.mu.Lock()
			for k, c := range l.clients {
				if time.Since(c.seen) > 10*time.Minute {
					delete(l.clients, k)
				}
			}
			l.mu.Unlock()
		}
	}()
	return l
}

func (l *limiter) allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	c, ok := l.clients[key]
	if !ok {
		c = &client{lim: rate.NewLimiter(l.rate, l.burst)}
		l.clients[key] = c
	}
	c.seen = time.Now()
	return c.lim.Allow()
}

func (s *Server) limit(l *limiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !l.allow(s.clientIP(r)) {
				w.Header().Set("Retry-After", "60")
				writeError(w, r, &app.Error{Status: http.StatusTooManyRequests, Code: "rate_limited",
					Message: "Too many requests. Please wait a minute and try again."})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
