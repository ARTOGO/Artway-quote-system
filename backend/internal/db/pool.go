// Package db wires the Postgres connection pool used by the quote-app
// backend. Uses pgx/v5 with sensible production defaults. M2 establishes
// the Pool type; M3 adds migrations and sqlc-generated queries on top.
package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultMaxConns          = int32(10)
	defaultMinConns          = int32(1)
	defaultMaxConnLifetime   = 30 * time.Minute
	defaultMaxConnIdleTime   = 5 * time.Minute
	defaultHealthCheckPeriod = 1 * time.Minute

	pingTimeout = 5 * time.Second
)

// ErrEmptyURL is returned when New is called with an empty databaseURL.
// Caller should treat this as a config error (not a runtime DB error).
var ErrEmptyURL = errors.New("db: databaseURL is required")

// Pool wraps pgxpool.Pool. Repository / handler layers should depend on
// *Pool (not the bare pgxpool.Pool) so app-specific helpers (transactions,
// instrumentation) can grow here without touching call sites.
type Pool struct {
	*pgxpool.Pool
}

// New parses databaseURL, applies production-grade defaults, and opens
// the connection pool. The caller owns the lifecycle and must call Close
// on shutdown.
func New(ctx context.Context, databaseURL string) (*Pool, error) {
	if databaseURL == "" {
		return nil, ErrEmptyURL
	}

	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("db: parse config: %w", err)
	}

	cfg.MaxConns = defaultMaxConns
	cfg.MinConns = defaultMinConns
	cfg.MaxConnLifetime = defaultMaxConnLifetime
	cfg.MaxConnIdleTime = defaultMaxConnIdleTime
	cfg.HealthCheckPeriod = defaultHealthCheckPeriod

	p, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("db: create pool: %w", err)
	}

	return &Pool{Pool: p}, nil
}

// PingWithTimeout verifies connectivity within pingTimeout. Used by the
// /readyz handler in M3+ so Cloud Run knows when to stop routing traffic.
func (p *Pool) PingWithTimeout(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, pingTimeout)
	defer cancel()
	return p.Ping(ctx)
}
