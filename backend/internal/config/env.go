// Package config loads runtime configuration from environment variables.
// All env vars are read once at startup; later mutation is not supported
// (Cloud Run restarts the container on config change).
package config

import (
	"errors"
	"fmt"
	"os"
)

// Env enumerates the three deployment environments.
type Env string

const (
	EnvDev     Env = "dev"
	EnvStaging Env = "staging"
	EnvProd    Env = "prod"
)

// Config holds all runtime knobs. Future fields go here, not into scattered
// os.Getenv calls — keeps test setup straightforward via t.Setenv + Load.
type Config struct {
	// Port the HTTP server binds. Cloud Run injects PORT; locally defaults
	// to 8080.
	Port string

	// DatabaseURL is a pgx-compatible Postgres URI. Required in all envs.
	DatabaseURL string

	// Env selects code paths that differ between dev/staging/prod (mainly
	// auth bypass and verbose logging in dev).
	Env Env

	// DevUserEmail is the simulated logged-in user when Env == EnvDev.
	// Bypasses IAP (which isn't reachable from localhost). Required when
	// Env == EnvDev; ignored otherwise.
	DevUserEmail string
}

// Sentinel errors so callers can use errors.Is in tests / setup code.
var (
	ErrMissingDatabaseURL  = errors.New("config: DATABASE_URL is required")
	ErrMissingDevUserEmail = errors.New("config: DEV_USER_EMAIL is required when ENV=dev")
	ErrInvalidEnv          = errors.New("config: ENV must be one of dev/staging/prod")
)

// Load reads env vars and returns a validated Config. Errors are returned
// (not panicked) so main can log them with structured fields before exit.
func Load() (*Config, error) {
	c := &Config{
		Port:         getEnv("PORT", "8080"),
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		Env:          Env(getEnv("ENV", string(EnvDev))),
		DevUserEmail: os.Getenv("DEV_USER_EMAIL"),
	}

	switch c.Env {
	case EnvDev, EnvStaging, EnvProd:
		// ok
	default:
		return nil, fmt.Errorf("%w: got %q", ErrInvalidEnv, c.Env)
	}

	if c.DatabaseURL == "" {
		return nil, ErrMissingDatabaseURL
	}

	if c.Env == EnvDev && c.DevUserEmail == "" {
		return nil, ErrMissingDevUserEmail
	}

	return c, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
