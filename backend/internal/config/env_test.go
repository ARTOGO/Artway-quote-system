package config_test

import (
	"errors"
	"testing"

	"github.com/ARTOGO/Artway-quote-system/backend/internal/config"
)

func TestLoad_DefaultsPortAndEnv(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("DATABASE_URL", "postgres://localhost/quotes")
	t.Setenv("ENV", "")
	t.Setenv("DEV_USER_EMAIL", "peter@artogo.co")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() err = %v, want nil", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want %q", cfg.Port, "8080")
	}
	if cfg.Env != config.EnvDev {
		t.Errorf("Env = %q, want %q", cfg.Env, config.EnvDev)
	}
}

func TestLoad_AllEnvOverrides(t *testing.T) {
	t.Setenv("PORT", "3000")
	t.Setenv("DATABASE_URL", "postgres://prod-db/quotes")
	t.Setenv("ENV", "prod")
	t.Setenv("DEV_USER_EMAIL", "ignored-in-prod@artogo.co")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() err = %v, want nil", err)
	}
	if cfg.Port != "3000" {
		t.Errorf("Port = %q, want %q", cfg.Port, "3000")
	}
	if cfg.DatabaseURL != "postgres://prod-db/quotes" {
		t.Errorf("DatabaseURL = %q", cfg.DatabaseURL)
	}
	if cfg.Env != config.EnvProd {
		t.Errorf("Env = %q, want %q", cfg.Env, config.EnvProd)
	}
}

func TestLoad_MissingDatabaseURL(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("ENV", "staging")
	t.Setenv("DEV_USER_EMAIL", "")

	_, err := config.Load()
	if !errors.Is(err, config.ErrMissingDatabaseURL) {
		t.Errorf("err = %v, want ErrMissingDatabaseURL", err)
	}
}

func TestLoad_DevWithoutEmail(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("DATABASE_URL", "postgres://localhost/quotes")
	t.Setenv("ENV", "dev")
	t.Setenv("DEV_USER_EMAIL", "")

	_, err := config.Load()
	if !errors.Is(err, config.ErrMissingDevUserEmail) {
		t.Errorf("err = %v, want ErrMissingDevUserEmail", err)
	}
}

func TestLoad_InvalidEnv(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("DATABASE_URL", "postgres://localhost/quotes")
	t.Setenv("ENV", "production") // ENV 必須是 prod 不是 production
	t.Setenv("DEV_USER_EMAIL", "")

	_, err := config.Load()
	if !errors.Is(err, config.ErrInvalidEnv) {
		t.Errorf("err = %v, want ErrInvalidEnv", err)
	}
}

func TestLoad_StagingDoesNotRequireDevUserEmail(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("DATABASE_URL", "postgres://staging/quotes")
	t.Setenv("ENV", "staging")
	t.Setenv("DEV_USER_EMAIL", "")

	cfg, err := config.Load()
	if err != nil {
		t.Fatalf("Load() err = %v, want nil", err)
	}
	if cfg.Env != config.EnvStaging {
		t.Errorf("Env = %q, want staging", cfg.Env)
	}
}
