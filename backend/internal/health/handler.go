// Package health provides liveness and readiness HTTP handlers for the
// quote-app backend. M1 returns hardcoded ok/ready; M2 will add DB ping
// to Readyz so Cloud Run only routes traffic when Postgres is reachable.
package health

import (
	"encoding/json"
	"log/slog"
	"net/http"
)

// Healthz handles GET /healthz. Liveness check — no external dependencies.
// Cloud Run uses this to decide whether to restart the container.
func Healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Readyz handles GET /readyz. Readiness check — should fail when external
// dependencies (DB, Redis, etc.) are unreachable so Cloud Run stops routing
// traffic. M1 returns ready unconditionally; wired up in M2.
func Readyz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("writeJSON encode failed", "error", err)
	}
}
