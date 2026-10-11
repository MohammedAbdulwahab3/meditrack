package config

import (
	"errors"
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port           string
	DatabaseURL    string
	Production     bool
	CookieSecure   bool   // Secure flag on the session cookie; defaults to Production
	SecretKey      string // HMAC key used to anonymise scanner fingerprints
	SessionTTL     time.Duration
	TrustProxy     bool   // read client IP from X-Forwarded-For (only behind a trusted reverse proxy)
	ClientIPHeader string // with TrustProxy: a header the edge proxy always overwrites with the client IP (e.g. CF-Connecting-IP)
	AdminEmail     string
	AdminPassword  string
	AdminName      string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:           env("PORT", "8090"),
		DatabaseURL:    env("DATABASE_URL", "postgres://meditrack:meditrack@localhost:5433/meditrack?sslmode=disable"),
		Production:     env("APP_ENV", "development") == "production",
		SecretKey:      env("SECRET_KEY", ""),
		SessionTTL:     time.Duration(envInt("SESSION_TTL_HOURS", 24*7)) * time.Hour,
		TrustProxy:     env("TRUST_PROXY", "false") == "true",
		ClientIPHeader: env("CLIENT_IP_HEADER", ""),
		AdminEmail:     env("ADMIN_EMAIL", ""),
		AdminPassword:  env("ADMIN_PASSWORD", ""),
		AdminName:      env("ADMIN_NAME", "Platform Admin"),
	}

	cfg.CookieSecure = env("COOKIE_SECURE", strconv.FormatBool(cfg.Production)) == "true"

	if cfg.SecretKey == "" {
		if cfg.Production {
			return nil, errors.New("SECRET_KEY is required in production")
		}
		cfg.SecretKey = "dev-only-secret-key-change-me"
	}
	if cfg.Production && len(cfg.SecretKey) < 32 {
		return nil, errors.New("SECRET_KEY must be at least 32 characters in production")
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v, err := strconv.Atoi(os.Getenv(key)); err == nil && v > 0 {
		return v
	}
	return fallback
}
