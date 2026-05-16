// Command server is the Cloud Run entrypoint for the quote-app backend.
//
// M1: routes /healthz + /readyz with chi router, structured logging via
// slog, graceful shutdown on SIGINT/SIGTERM. PORT env var honoured (Cloud
// Run injects it). Real DB/IAP wiring lands in M2-M5.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ARTOGO/Artway-quote-system/backend/internal/health"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

const (
	defaultPort         = "8080"
	requestTimeout      = 10 * time.Second
	readTimeout         = 5 * time.Second
	writeTimeout        = 15 * time.Second
	idleTimeout         = 60 * time.Second
	shutdownGracePeriod = 10 * time.Second
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	r := newRouter()

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,
	}

	idleClosed := make(chan struct{})
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("shutdown signal received, draining connections")
		ctx, cancel := context.WithTimeout(context.Background(), shutdownGracePeriod)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			slog.Error("server shutdown failed", "error", err)
		}
		close(idleClosed)
	}()

	slog.Info("server starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("listen failed", "error", err)
		os.Exit(1)
	}
	<-idleClosed
	slog.Info("server stopped")
}

// newRouter wires the HTTP routes. Extracted from main for testability — M5+
// tests will run the full router end-to-end via httptest.NewServer.
func newRouter() *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(requestTimeout))

	r.Get("/healthz", health.Healthz)
	r.Get("/readyz", health.Readyz)

	return r
}
