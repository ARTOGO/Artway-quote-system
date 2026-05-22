package quotes

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/ARTOGO/Artway-quote-system/backend/internal/db"
	sqlcgen "github.com/ARTOGO/Artway-quote-system/backend/internal/quotes/sqlcgen"
)

// ErrNotFound is returned when a quote is not found or has been soft-deleted.
// Handler maps this to 404; other errors map to 500.
var ErrNotFound = errors.New("quotes: not found")

// Repository defines the data-access surface for quotes. Handlers depend
// on the interface (not the concrete impl) so tests can swap in fakes
// without spinning up Postgres. Production wiring uses NewRepository.
type Repository interface {
	NextNumber(ctx context.Context, now time.Time) (string, error)
	Create(ctx context.Context, p CreateParams) (*WriteResult, error)
	CreateWithAllocatedNumber(ctx context.Context, now time.Time, p CreateParams) (*WriteResult, error)
	Update(ctx context.Context, id uuid.UUID, p UpdateParams) (*WriteResult, error)
	List(ctx context.Context, p ListParams) (*ListResult, error)
	Get(ctx context.Context, id uuid.UUID) (*Quote, error)
	GetByQuoteNo(ctx context.Context, quoteNo string) (*Quote, error)
	SoftDelete(ctx context.Context, id uuid.UUID) error
	DistinctSales(ctx context.Context) ([]string, error)
}

// repo is the production impl backed by sqlcgen.Queries (which talks to
// pgxpool.Pool). Wrapped here so we own the conversion from pgtype.Date /
// pgtype.Timestamptz to Go-native *time.Time / time.Time — handlers
// never see pgtype types.
type repo struct {
	pool *db.Pool
	q    sqlcgen.Querier
}

// NewRepository wires the production Repository with a pool from internal/db.
func NewRepository(pool *db.Pool) Repository {
	return &repo{pool: pool, q: sqlcgen.New(pool)}
}

// ─── Input / Output types ─────────────────────────────────────────────────

// CreateParams is the Go-native input for POST /quotes. Body is the entire
// JSON payload received (stored as-is in body JSONB — SPEC §4 black box).
type CreateParams struct {
	QuoteNo       string
	Status        string
	Title         string
	TotalAmount   int64
	ClientCompany string
	SalesName     string
	IssueDate     *time.Time // nullable (前端有時還沒選日期就先 save draft)
	Body          json.RawMessage
	UserEmail     string // written to created_by + updated_by
}

// UpdateParams is the Go-native input for PUT /quotes/{id}. quote_no is
// not here because SPEC §3.3 says it's a permanent ID (ignored on update).
type UpdateParams struct {
	Status        string
	Title         string
	TotalAmount   int64
	ClientCompany string
	SalesName     string
	IssueDate     *time.Time
	Body          json.RawMessage
	UserEmail     string // written to updated_by
}

// WriteResult is returned by Create and Update. CreatedAt is zero on
// Update (handler doesn't include it in the response).
type WriteResult struct {
	ID        uuid.UUID
	QuoteNo   string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ListParams corresponds to GET /quotes query string + pagination.
type ListParams struct {
	DateFrom  *time.Time // nullable filter
	DateTo    *time.Time
	SalesName *string
	Status    *string
	Page      int32 // 1-indexed
	PageSize  int32
}

// ListItem is one row in the List response (metadata only, no body).
type ListItem struct {
	ID            uuid.UUID
	QuoteNo       string
	Status        string
	Title         string
	TotalAmount   int64
	ClientCompany string
	SalesName     string
	IssueDate     *time.Time
	UpdatedAt     time.Time
}

// ListResult wraps items + pagination metadata so the handler can emit a
// single JSON object matching SPEC §3.4.
type ListResult struct {
	Items    []ListItem
	Total    int64
	Page     int32
	PageSize int32
}

// Quote is the full Get response (including body JSONB) — SPEC §3.5.
type Quote struct {
	ID            uuid.UUID
	QuoteNo       string
	Status        string
	Title         string
	TotalAmount   int64
	ClientCompany string
	SalesName     string
	IssueDate     *time.Time
	Body          json.RawMessage
	CreatedBy     string
	UpdatedBy     string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// ─── Repository impl ──────────────────────────────────────────────────────

func (r *repo) NextNumber(ctx context.Context, now time.Time) (string, error) {
	key := dateKey(now)
	seq, err := r.q.NextNumber(ctx, key)
	if err != nil {
		return "", fmt.Errorf("next number: %w", err)
	}
	return quoteNo(key, seq), nil
}

func (r *repo) Create(ctx context.Context, p CreateParams) (*WriteResult, error) {
	return createQuote(ctx, r.q, p)
}

func (r *repo) CreateWithAllocatedNumber(
	ctx context.Context,
	now time.Time,
	p CreateParams,
) (*WriteResult, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin create quote transaction: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	qtx := sqlcgen.New(tx)
	key := dateKey(now)
	seq, err := qtx.NextNumber(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("allocate quote number in transaction: %w", err)
	}
	p.QuoteNo = quoteNo(key, seq)

	result, err := createQuote(ctx, qtx, p)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit create quote transaction: %w", err)
	}
	committed = true
	return result, nil
}

func createQuote(
	ctx context.Context,
	q sqlcgen.Querier,
	p CreateParams,
) (*WriteResult, error) {
	row, err := q.CreateQuote(ctx, sqlcgen.CreateQuoteParams{
		QuoteNo:       p.QuoteNo,
		Status:        p.Status,
		Title:         p.Title,
		TotalAmount:   p.TotalAmount,
		ClientCompany: p.ClientCompany,
		SalesName:     p.SalesName,
		IssueDate:     timeToDate(p.IssueDate),
		Body:          []byte(p.Body),
		CreatedBy:     p.UserEmail,
	})
	if err != nil {
		return nil, fmt.Errorf("create quote: %w", err)
	}
	return &WriteResult{
		ID:        row.ID,
		QuoteNo:   row.QuoteNo,
		CreatedAt: row.CreatedAt.Time,
		UpdatedAt: row.UpdatedAt.Time,
	}, nil
}

func (r *repo) Update(ctx context.Context, id uuid.UUID, p UpdateParams) (*WriteResult, error) {
	row, err := r.q.UpdateQuote(ctx, sqlcgen.UpdateQuoteParams{
		ID:            id,
		Status:        p.Status,
		Title:         p.Title,
		TotalAmount:   p.TotalAmount,
		ClientCompany: p.ClientCompany,
		SalesName:     p.SalesName,
		IssueDate:     timeToDate(p.IssueDate),
		Body:          []byte(p.Body),
		UpdatedBy:     p.UserEmail,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update quote: %w", err)
	}
	return &WriteResult{
		ID:        row.ID,
		QuoteNo:   row.QuoteNo,
		UpdatedAt: row.UpdatedAt.Time,
	}, nil
}

func (r *repo) List(ctx context.Context, p ListParams) (*ListResult, error) {
	dateFrom := timeToDate(p.DateFrom)
	dateTo := timeToDate(p.DateTo)

	items, err := r.q.ListQuotes(ctx, sqlcgen.ListQuotesParams{
		Limit:     p.PageSize,
		Offset:    (p.Page - 1) * p.PageSize,
		DateFrom:  dateFrom,
		DateTo:    dateTo,
		SalesName: p.SalesName,
		Status:    p.Status,
	})
	if err != nil {
		return nil, fmt.Errorf("list quotes: %w", err)
	}

	total, err := r.q.CountQuotes(ctx, sqlcgen.CountQuotesParams{
		DateFrom:  dateFrom,
		DateTo:    dateTo,
		SalesName: p.SalesName,
		Status:    p.Status,
	})
	if err != nil {
		return nil, fmt.Errorf("count quotes: %w", err)
	}

	out := &ListResult{
		Items:    make([]ListItem, 0, len(items)),
		Total:    total,
		Page:     p.Page,
		PageSize: p.PageSize,
	}
	for _, it := range items {
		out.Items = append(out.Items, ListItem{
			ID:            it.ID,
			QuoteNo:       it.QuoteNo,
			Status:        it.Status,
			Title:         it.Title,
			TotalAmount:   it.TotalAmount,
			ClientCompany: it.ClientCompany,
			SalesName:     it.SalesName,
			IssueDate:     dateToTimePtr(it.IssueDate),
			UpdatedAt:     it.UpdatedAt.Time,
		})
	}
	return out, nil
}

func (r *repo) Get(ctx context.Context, id uuid.UUID) (*Quote, error) {
	q, err := r.q.GetQuote(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get quote: %w", err)
	}
	return &Quote{
		ID:            q.ID,
		QuoteNo:       q.QuoteNo,
		Status:        q.Status,
		Title:         q.Title,
		TotalAmount:   q.TotalAmount,
		ClientCompany: q.ClientCompany,
		SalesName:     q.SalesName,
		IssueDate:     dateToTimePtr(q.IssueDate),
		Body:          q.Body, // pgtype JSONB → raw bytes
		CreatedBy:     q.CreatedBy,
		UpdatedBy:     q.UpdatedBy,
		CreatedAt:     q.CreatedAt.Time,
		UpdatedAt:     q.UpdatedAt.Time,
	}, nil
}

func (r *repo) GetByQuoteNo(ctx context.Context, quoteNo string) (*Quote, error) {
	q, err := r.q.GetQuoteByNo(ctx, quoteNo)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get quote by no: %w", err)
	}
	return &Quote{
		ID:            q.ID,
		QuoteNo:       q.QuoteNo,
		Status:        q.Status,
		Title:         q.Title,
		TotalAmount:   q.TotalAmount,
		ClientCompany: q.ClientCompany,
		SalesName:     q.SalesName,
		IssueDate:     dateToTimePtr(q.IssueDate),
		Body:          q.Body,
		CreatedBy:     q.CreatedBy,
		UpdatedBy:     q.UpdatedBy,
		CreatedAt:     q.CreatedAt.Time,
		UpdatedAt:     q.UpdatedAt.Time,
	}, nil
}

func (r *repo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	n, err := r.q.SoftDeleteQuote(ctx, id)
	if err != nil {
		return fmt.Errorf("soft delete: %w", err)
	}
	if n == 0 {
		return ErrNotFound // either never existed or already deleted
	}
	return nil
}

func (r *repo) DistinctSales(ctx context.Context) ([]string, error) {
	names, err := r.q.DistinctSales(ctx)
	if err != nil {
		return nil, fmt.Errorf("distinct sales: %w", err)
	}
	// Always return non-nil slice so JSON encodes [] not null.
	if names == nil {
		return []string{}, nil
	}
	return names, nil
}

// ─── pgtype <-> Go conversions ────────────────────────────────────────────

func timeToDate(t *time.Time) pgtype.Date {
	if t == nil {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: *t, Valid: true}
}

func dateToTimePtr(d pgtype.Date) *time.Time {
	if !d.Valid {
		return nil
	}
	return &d.Time
}
