package static_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ARTOGO/Artway-quote-system/backend/internal/static"
)

func TestHandlerServesIndex(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()

	static.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "ARTWAY Quote System") {
		t.Fatalf("body did not include embedded index: %s", w.Body.String())
	}
}

func TestHandlerFallsBackToIndexForSPARoutes(t *testing.T) {
	t.Parallel()

	req := httptest.NewRequest(http.MethodGet, "/quote/AW-260522-001", nil)
	w := httptest.NewRecorder()

	static.Handler().ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "ARTWAY Quote System") {
		t.Fatalf("body did not include embedded index: %s", w.Body.String())
	}
}

func TestHandlerDoesNotFallbackForAPIRoutes(t *testing.T) {
	t.Parallel()

	for _, route := range []string{"/api", "/api/not-found"} {
		route := route
		t.Run(route, func(t *testing.T) {
			t.Parallel()

			req := httptest.NewRequest(http.MethodGet, route, nil)
			w := httptest.NewRecorder()

			static.Handler().ServeHTTP(w, req)

			if w.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404", w.Code)
			}
		})
	}
}
