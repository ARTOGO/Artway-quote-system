// Package auth wires GCP Identity-Aware Proxy (IAP) authentication into
// the request pipeline.
//
// Production / staging: IAP sits in front of Cloud Run, validates the
// Google Workspace user, and injects the X-Goog-Authenticated-User-Email
// header. This package extracts that email into the request context.
//
// Dev: IAP isn't reachable from localhost, so we read DEV_USER_EMAIL from
// config instead. The wire-format and request.Context() contract stay
// identical so handlers can be written once.
//
// Defence-in-depth: Cloud Run must be deployed with
// `ingress = internal-and-cloud-load-balancing` so requests cannot bypass
// IAP by hitting the `.run.app` URL directly. The middleware here is the
// second line; it returns 401 if no user can be extracted.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

// iapHeader is the HTTP header GCP IAP injects after Workspace SSO.
// Format: "accounts.google.com:peter@artogo.co" (provider:email).
const iapHeader = "X-Goog-Authenticated-User-Email"

// envDev matches config.EnvDev string value. Hardcoded here to avoid an
// import cycle (config imports nothing app-specific; auth shouldn't pull
// it in either since it's used by every handler).
const envDev = "dev"

// ctxKey is a private type so other packages cannot accidentally write
// to this context key (avoiding collisions).
type ctxKey int

const userEmailKey ctxKey = iota

// ErrNoUser is returned by UserFromContext when no user is in the context.
// Should only happen if Middleware was not applied to the route, which is
// a programmer error, not a runtime auth failure.
var ErrNoUser = errors.New("auth: no user in context")

// Config is the auth middleware config. Pass either env-loaded values
// (production) or a fixed test value (in tests).
type Config struct {
	// Env is the environment string ("prod" / "staging" / "dev").
	// Only "dev" triggers the DevUserEmail fallback.
	Env string

	// DevUserEmail is used in place of the IAP header when Env=="dev".
	// Required when Env=="dev" (config.Load enforces this).
	DevUserEmail string
}

// Middleware extracts the user email from IAP header (prod/staging) or
// DevUserEmail (dev), stores it in the request context, and rejects
// requests with no user (401).
func Middleware(cfg Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			email := extractEmail(r, cfg)
			if email == "" {
				slog.WarnContext(r.Context(), "auth: rejecting request with no user",
					"env", cfg.Env, "path", r.URL.Path)
				writeUnauthorized(w)
				return
			}
			ctx := context.WithValue(r.Context(), userEmailKey, email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// extractEmail returns the user email from IAP header (prod/staging) or
// DevUserEmail (dev). Returns "" if neither source has a value.
func extractEmail(r *http.Request, cfg Config) string {
	if cfg.Env == envDev && cfg.DevUserEmail != "" {
		return cfg.DevUserEmail
	}

	raw := r.Header.Get(iapHeader)
	if raw == "" {
		return ""
	}

	// Strip "accounts.google.com:" prefix. If colon missing, IAP changed
	// its format — return the raw value rather than empty (safer to log
	// + audit than to drop the request silently).
	if idx := strings.Index(raw, ":"); idx >= 0 {
		return raw[idx+1:]
	}
	return raw
}

// UserFromContext returns the user email stored by Middleware. Returns
// ErrNoUser if no user is in the context (Middleware not applied).
func UserFromContext(ctx context.Context) (string, error) {
	v := ctx.Value(userEmailKey)
	if v == nil {
		return "", ErrNoUser
	}
	s, ok := v.(string)
	if !ok || s == "" {
		return "", ErrNoUser
	}
	return s, nil
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": "unauthenticated"})
}
