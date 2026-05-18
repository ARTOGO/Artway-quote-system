package db_test

import (
	"context"
	"errors"
	"testing"

	"github.com/ARTOGO/Artway-quote-system/backend/internal/db"
)

func TestNew_RejectsEmptyURL(t *testing.T) {
	t.Parallel()

	_, err := db.New(context.Background(), "")
	if !errors.Is(err, db.ErrEmptyURL) {
		t.Errorf("err = %v, want ErrEmptyURL", err)
	}
}

func TestNew_RejectsInvalidURL(t *testing.T) {
	t.Parallel()

	// pgxpool.ParseConfig rejects garbage; we forward that error wrapped.
	_, err := db.New(context.Background(), "::::not-a-url")
	if err == nil {
		t.Fatal("err = nil, want parse error")
	}
	if errors.Is(err, db.ErrEmptyURL) {
		t.Errorf("err = %v, expected parse error, not ErrEmptyURL", err)
	}
}

// Note: real connection-establishing tests live in M3 alongside migrations.
// pgxpool.NewWithConfig is lazy — it doesn't open connections until first
// Acquire, so a syntactically valid URL pointing nowhere would pass here
// without exercising what we actually care about.
