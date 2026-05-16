// Command server is the Cloud Run entrypoint for the quote-app backend.
//
// Pipeline (M5):
//   request → chi middleware (RequestID/RealIP/Recoverer/Timeout)
//          → /healthz, /readyz       (no auth — Cloud Run probes)
//          → /api/*                  → auth.Middleware (IAP)
//                                    → /me + /quotes/* (7 endpoints)
//
// Wiring order in main:
//   config.Load() → db.New(pool) → quotes.NewRepository(pool)
//                                → quotes.NewHandler(repo)
//                                → newRouter(authCfg, handler)
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

	"github.com/ARTOGO/Artway-quote-system/backend/internal/auth"
	"github.com/ARTOGO/Artway-quote-system/backend/internal/config"
	"github.com/ARTOGO/Artway-quote-system/backend/internal/db"
	"github.com/ARTOGO/Artway-quote-system/backend/internal/health"
	"github.com/ARTOGO/Artway-quote-system/backend/internal/quotes"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

const (
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

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "error", err)
		os.Exit(1)
	}
	slog.Info("config loaded", "env", cfg.Env, "port", cfg.Port)

	ctx := context.Background()
	pool, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("db connect failed", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	slog.Info("db pool initialised")

	authCfg := auth.Config{
		Env:          string(cfg.Env),
		DevUserEmail: cfg.DevUserEmail,
	}
	handler := quotes.NewHandler(quotes.NewRepository(pool))

	r := newRouter(authCfg, handler)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
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

	slog.Info("server starting", "port", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("listen failed", "error", err)
		os.Exit(1)
	}
	<-idleClosed
	slog.Info("server stopped")
}

// newRouter wires HTTP routes. Probes sit on the root outside auth;
// application routes live under /api/* behind IAP middleware.
func newRouter(authCfg auth.Config, h *quotes.Handler) *chi.Mux {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(requestTimeout))

	// Probes — no auth.
	r.Get("/healthz", health.Healthz)
	r.Get("/readyz", health.Readyz)

	// Application routes — IAP-gated.
	r.Route("/api", func(r chi.Router) {
		r.Use(auth.Middleware(authCfg))
		quotes.Mount(r, h)
	})

	return r
}
