package quotes_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/ARTOGO/Artway-quote-system/backend/internal/quotes"
)

type serviceRepo struct {
	createFn                  func(ctx context.Context, p quotes.CreateParams) (*quotes.WriteResult, error)
	createWithAllocatedNumber func(ctx context.Context, now time.Time, p quotes.CreateParams) (*quotes.WriteResult, error)
}

func (f *serviceRepo) Create(ctx context.Context, p quotes.CreateParams) (*quotes.WriteResult, error) {
	return f.createFn(ctx, p)
}

func (f *serviceRepo) CreateWithAllocatedNumber(
	ctx context.Context,
	now time.Time,
	p quotes.CreateParams,
) (*quotes.WriteResult, error) {
	return f.createWithAllocatedNumber(ctx, now, p)
}

func TestServiceCreateQuote_AllocatesMissingQuoteNoInCreateUseCase(t *testing.T) {
	t.Parallel()

	wantID := uuid.New()
	repo := &serviceRepo{
		createFn: func(context.Context, quotes.CreateParams) (*quotes.WriteResult, error) {
			t.Fatal("CreateQuote should use transactional allocation when quote_no is empty")
			return nil, nil
		},
		createWithAllocatedNumber: func(_ context.Context, now time.Time, p quotes.CreateParams) (*quotes.WriteResult, error) {
			if now.IsZero() {
				t.Fatal("now must be passed for Asia/Taipei serial date")
			}
			if got := now.Location().String(); got != "Asia/Taipei" {
				t.Fatalf("now location = %q, want Asia/Taipei", got)
			}
			if p.QuoteNo != "" {
				t.Fatalf("QuoteNo before allocation = %q, want empty", p.QuoteNo)
			}
			if !json.Valid(p.Body) {
				t.Fatalf("Body is not valid JSON: %s", p.Body)
			}
			return &quotes.WriteResult{
				ID:        wantID,
				QuoteNo:   "AW-260522-004",
				CreatedAt: time.Date(2026, 5, 22, 6, 0, 0, 0, time.UTC),
				UpdatedAt: time.Date(2026, 5, 22, 6, 0, 0, 0, time.UTC),
			}, nil
		},
	}

	got, err := quotes.NewService(repo).CreateQuote(context.Background(), quotes.CreateParams{
		Status: "draft",
		Body:   json.RawMessage(`{"status":"draft"}`),
	})
	if err != nil {
		t.Fatalf("CreateQuote returned error: %v", err)
	}
	if got.ID != wantID {
		t.Fatalf("ID = %s, want %s", got.ID, wantID)
	}
	if got.QuoteNo != "AW-260522-004" {
		t.Fatalf("QuoteNo = %q, want AW-260522-004", got.QuoteNo)
	}
}

func TestServiceCreateQuote_UsesProvidedQuoteNoWithoutAllocation(t *testing.T) {
	t.Parallel()

	repo := &serviceRepo{
		createWithAllocatedNumber: func(context.Context, time.Time, quotes.CreateParams) (*quotes.WriteResult, error) {
			t.Fatal("CreateQuote should not use allocation path when quote_no is already provided")
			return nil, nil
		},
		createFn: func(_ context.Context, p quotes.CreateParams) (*quotes.WriteResult, error) {
			if p.QuoteNo != "MANUAL-001" {
				t.Fatalf("QuoteNo = %q, want MANUAL-001", p.QuoteNo)
			}
			return &quotes.WriteResult{
				ID:        uuid.New(),
				QuoteNo:   p.QuoteNo,
				CreatedAt: time.Date(2026, 5, 22, 6, 0, 0, 0, time.UTC),
				UpdatedAt: time.Date(2026, 5, 22, 6, 0, 0, 0, time.UTC),
			}, nil
		},
	}

	got, err := quotes.NewService(repo).CreateQuote(context.Background(), quotes.CreateParams{
		QuoteNo: "MANUAL-001",
		Status:  "draft",
		Body:    json.RawMessage(`{"quote_no":"MANUAL-001","status":"draft"}`),
	})
	if err != nil {
		t.Fatalf("CreateQuote returned error: %v", err)
	}
	if got.QuoteNo != "MANUAL-001" {
		t.Fatalf("QuoteNo = %q, want MANUAL-001", got.QuoteNo)
	}
}

func TestServiceCreateQuote_AllocationErrorPropagates(t *testing.T) {
	t.Parallel()

	wantErr := errors.New("allocate failed")
	repo := &serviceRepo{
		createWithAllocatedNumber: func(context.Context, time.Time, quotes.CreateParams) (*quotes.WriteResult, error) {
			return nil, wantErr
		},
	}

	_, err := quotes.NewService(repo).CreateQuote(context.Background(), quotes.CreateParams{
		Status: "draft",
		Body:   json.RawMessage(`{"status":"draft"}`),
	})
	if !errors.Is(err, wantErr) {
		t.Fatalf("err = %v, want %v", err, wantErr)
	}
}
