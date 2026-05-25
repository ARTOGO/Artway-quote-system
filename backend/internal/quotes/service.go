package quotes

import (
	"context"
	"time"
)

// CreateQuoteRepository is the repository port required by the create-quote
// use case. Keeping this narrower than Repository avoids coupling the service
// to read/list/delete operations it does not orchestrate.
type CreateQuoteRepository interface {
	Create(ctx context.Context, p CreateParams) (*WriteResult, error)
	CreateWithAllocatedNumber(ctx context.Context, now time.Time, p CreateParams) (*WriteResult, error)
}

// Service is the application layer for quote use cases. HTTP handlers parse and
// format requests; this layer owns business flow such as save-time allocation.
type Service struct {
	repo CreateQuoteRepository
	now  func() time.Time
}

// NewService creates the quote application service.
func NewService(repo CreateQuoteRepository) *Service {
	return &Service{repo: repo, now: nowInTaipei}
}

// CreateQuote persists a quote. If the quote number is absent, allocation and
// INSERT are delegated to the repository's transactional path so serials and
// quote rows are committed or rolled back together.
func (s *Service) CreateQuote(ctx context.Context, p CreateParams) (*WriteResult, error) {
	if p.QuoteNo == "" {
		return s.repo.CreateWithAllocatedNumber(ctx, s.now(), p)
	}
	return s.repo.Create(ctx, p)
}
