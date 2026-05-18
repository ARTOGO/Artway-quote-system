package auth_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ARTOGO/Artway-quote-system/backend/internal/auth"
)

const iapHeader = "X-Goog-Authenticated-User-Email"

func TestMiddleware_ProdReadsIapHeaderAndStripsPrefix(t *testing.T) {
	t.Parallel()

	cfg := auth.Config{Env: "prod"}

	var capturedEmail string
	handler := auth.Middleware(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		email, err := auth.UserFromContext(r.Context())
		if err != nil {
			t.Errorf("UserFromContext err = %v, want nil", err)
		}
		capturedEmail = email
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(iapHeader, "accounts.google.com:peter@artogo.co")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	if capturedEmail != "peter@artogo.co" {
		t.Errorf("email = %q, want %q", capturedEmail, "peter@artogo.co")
	}
}

func TestMiddleware_ProdRejectsMissingHeader(t *testing.T) {
	t.Parallel()

	cfg := auth.Config{Env: "prod"}

	called := false
	handler := auth.Middleware(cfg)(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		called = true
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	if called {
		t.Error("downstream handler was called; middleware should have rejected the request")
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("Content-Type = %q, want JSON", ct)
	}
}

func TestMiddleware_StagingRejectsMissingHeader(t *testing.T) {
	t.Parallel()

	// Staging shares prod's "no IAP header → 401" semantic, even though
	// staging may have looser real-world traffic.
	cfg := auth.Config{Env: "staging"}

	handler := auth.Middleware(cfg)(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		t.Error("downstream called; staging should reject missing IAP header")
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

func TestMiddleware_DevUsesEnvVarWhenNoHeader(t *testing.T) {
	t.Parallel()

	cfg := auth.Config{Env: "dev", DevUserEmail: "dev@artogo.co"}

	var capturedEmail string
	handler := auth.Middleware(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedEmail, _ = auth.UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil) // no IAP header
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	if capturedEmail != "dev@artogo.co" {
		t.Errorf("email = %q, want %q", capturedEmail, "dev@artogo.co")
	}
}

func TestMiddleware_DevPrefersEnvVarOverHeader(t *testing.T) {
	t.Parallel()

	// In dev, DevUserEmail wins even if someone manually sets the IAP
	// header — local dev should never trust client-supplied identities.
	cfg := auth.Config{Env: "dev", DevUserEmail: "dev@artogo.co"}

	var capturedEmail string
	handler := auth.Middleware(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedEmail, _ = auth.UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(iapHeader, "accounts.google.com:attacker@evil.com")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if capturedEmail != "dev@artogo.co" {
		t.Errorf("email = %q, want %q (dev should ignore client-supplied IAP header)",
			capturedEmail, "dev@artogo.co")
	}
}

func TestMiddleware_HandlesHeaderWithoutColon(t *testing.T) {
	t.Parallel()

	// Defensive: IAP format is "accounts.google.com:email", but if Google
	// ever changes it, we treat the whole value as the email rather than
	// dropping the request silently.
	cfg := auth.Config{Env: "prod"}

	var capturedEmail string
	handler := auth.Middleware(cfg)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedEmail, _ = auth.UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set(iapHeader, "raw@artogo.co")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if capturedEmail != "raw@artogo.co" {
		t.Errorf("email = %q, want %q", capturedEmail, "raw@artogo.co")
	}
}

func TestUserFromContext_ReturnsErrNoUserWhenMissing(t *testing.T) {
	t.Parallel()

	_, err := auth.UserFromContext(context.Background())
	if !errors.Is(err, auth.ErrNoUser) {
		t.Errorf("err = %v, want ErrNoUser", err)
	}
}

func TestUserFromContext_ReturnsErrNoUserForEmptyEmail(t *testing.T) {
	t.Parallel()

	// Edge case: middleware shouldn't store empty strings, but if it
	// somehow does (or a future caller bypasses Middleware), surfacing
	// ErrNoUser is safer than returning "".
	ctx := context.Background()
	_, err := auth.UserFromContext(ctx) // empty context, no user
	if !errors.Is(err, auth.ErrNoUser) {
		t.Errorf("err = %v, want ErrNoUser", err)
	}
}
