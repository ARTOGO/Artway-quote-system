package quotes_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ARTOGO/Artway-quote-system/backend/internal/auth"
	"github.com/ARTOGO/Artway-quote-system/backend/internal/quotes"
)

// ─── fakeRepo: in-memory Repository for handler tests ─────────────────────

type fakeRepo struct {
	nextNumberFn    func(ctx context.Context, now time.Time) (string, error)
	createFn        func(ctx context.Context, p quotes.CreateParams) (*quotes.WriteResult, error)
	updateFn        func(ctx context.Context, id uuid.UUID, p quotes.UpdateParams) (*quotes.WriteResult, error)
	listFn          func(ctx context.Context, p quotes.ListParams) (*quotes.ListResult, error)
	getFn           func(ctx context.Context, id uuid.UUID) (*quotes.Quote, error)
	softDeleteFn    func(ctx context.Context, id uuid.UUID) error
	distinctSalesFn func(ctx context.Context) ([]string, error)
}

func (f *fakeRepo) NextNumber(ctx context.Context, now time.Time) (string, error) {
	return f.nextNumberFn(ctx, now)
}
func (f *fakeRepo) Create(ctx context.Context, p quotes.CreateParams) (*quotes.WriteResult, error) {
	return f.createFn(ctx, p)
}
func (f *fakeRepo) Update(ctx context.Context, id uuid.UUID, p quotes.UpdateParams) (*quotes.WriteResult, error) {
	return f.updateFn(ctx, id, p)
}
func (f *fakeRepo) List(ctx context.Context, p quotes.ListParams) (*quotes.ListResult, error) {
	return f.listFn(ctx, p)
}
func (f *fakeRepo) Get(ctx context.Context, id uuid.UUID) (*quotes.Quote, error) {
	return f.getFn(ctx, id)
}
func (f *fakeRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	return f.softDeleteFn(ctx, id)
}
func (f *fakeRepo) DistinctSales(ctx context.Context) ([]string, error) {
	return f.distinctSalesFn(ctx)
}

// mountWithAuth attaches the auth header bypass and mounts the handler routes.
func mountWithAuth(h *quotes.Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(auth.Middleware(auth.Config{Env: "dev", DevUserEmail: "tester@artogo.co"}))
	quotes.Mount(r, h)
	return r
}

// ─── /api/me ──────────────────────────────────────────────────────────────

func TestMe_ReturnsAuthenticatedEmail(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodGet, "/me", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body["email"] != "tester@artogo.co" {
		t.Errorf("email = %q, want tester@artogo.co", body["email"])
	}
}

// ─── /api/quotes/next-number ───────────────────────────────────────────────

func TestNextNumber_ReturnsQuoteNo(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{
		nextNumberFn: func(_ context.Context, _ time.Time) (string, error) {
			return "AW-260516-007", nil
		},
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodPost, "/quotes/next-number", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body map[string]string
	_ = json.NewDecoder(w.Body).Decode(&body)
	if body["quote_no"] != "AW-260516-007" {
		t.Errorf("quote_no = %q, want AW-260516-007", body["quote_no"])
	}
}

func TestNextNumber_RepoError_500(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{
		nextNumberFn: func(_ context.Context, _ time.Time) (string, error) {
			return "", errors.New("db down")
		},
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodPost, "/quotes/next-number", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", w.Code)
	}
}

// ─── POST /api/quotes ─────────────────────────────────────────────────────

func TestCreate_HappyPath(t *testing.T) {
	t.Parallel()

	wantID := uuid.New()
	var capturedUser string
	var capturedBody json.RawMessage

	h := quotes.NewHandler(&fakeRepo{
		createFn: func(_ context.Context, p quotes.CreateParams) (*quotes.WriteResult, error) {
			capturedUser = p.UserEmail
			capturedBody = p.Body
			return &quotes.WriteResult{
				ID:        wantID,
				QuoteNo:   p.QuoteNo,
				CreatedAt: time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC),
				UpdatedAt: time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC),
			}, nil
		},
	})
	srv := mountWithAuth(h)

	payload := `{
		"quote_no": "AW-260516-001",
		"status": "draft",
		"title": "Test Project",
		"total_amount": 100000,
		"client_company": "Test Co",
		"sales_name": "Peter",
		"issue_date": "2026-05-16",
		"meta": {"foo": "bar"},
		"groups": []
	}`

	req := httptest.NewRequest(http.MethodPost, "/quotes", strings.NewReader(payload))
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want 201 (body=%s)", w.Code, w.Body.String())
	}
	if capturedUser != "tester@artogo.co" {
		t.Errorf("UserEmail = %q, want tester@artogo.co", capturedUser)
	}
	if !bytes.Contains(capturedBody, []byte("foo")) {
		t.Errorf("body did not propagate full JSON (got %s)", capturedBody)
	}
}

func TestCreate_InvalidStatus_400(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{})
	srv := mountWithAuth(h)

	payload := `{"quote_no":"AW-260516-001","status":"invalid"}`
	req := httptest.NewRequest(http.MethodPost, "/quotes", strings.NewReader(payload))
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestCreate_MissingQuoteNo_400(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{})
	srv := mountWithAuth(h)

	payload := `{"status":"draft"}`
	req := httptest.NewRequest(http.MethodPost, "/quotes", strings.NewReader(payload))
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ─── PUT /api/quotes/{id} ─────────────────────────────────────────────────

func TestUpdate_HappyPath(t *testing.T) {
	t.Parallel()

	id := uuid.New()
	h := quotes.NewHandler(&fakeRepo{
		updateFn: func(_ context.Context, gotID uuid.UUID, p quotes.UpdateParams) (*quotes.WriteResult, error) {
			if gotID != id {
				t.Errorf("id mismatch: got %s, want %s", gotID, id)
			}
			return &quotes.WriteResult{
				ID:        gotID,
				QuoteNo:   "AW-260516-001",
				UpdatedAt: time.Date(2026, 5, 16, 13, 0, 0, 0, time.UTC),
			}, nil
		},
	})
	srv := mountWithAuth(h)

	payload := `{"status":"sent","title":"x","total_amount":0,"client_company":"","sales_name":"","issue_date":""}`
	req := httptest.NewRequest(http.MethodPut, "/quotes/"+id.String(), strings.NewReader(payload))
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", w.Code, w.Body.String())
	}
}

func TestUpdate_NotFound_404(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{
		updateFn: func(_ context.Context, _ uuid.UUID, _ quotes.UpdateParams) (*quotes.WriteResult, error) {
			return nil, quotes.ErrNotFound
		},
	})
	srv := mountWithAuth(h)

	payload := `{"status":"draft"}`
	req := httptest.NewRequest(http.MethodPut, "/quotes/"+uuid.New().String(), strings.NewReader(payload))
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

func TestUpdate_InvalidID_400(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodPut, "/quotes/not-a-uuid", strings.NewReader(`{"status":"draft"}`))
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// ─── GET /api/quotes (List) ───────────────────────────────────────────────

func TestList_HappyPath(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{
		listFn: func(_ context.Context, p quotes.ListParams) (*quotes.ListResult, error) {
			if p.Page != 1 || p.PageSize != 20 {
				t.Errorf("page=%d pageSize=%d, want defaults 1/20", p.Page, p.PageSize)
			}
			return &quotes.ListResult{
				Items:    []quotes.ListItem{},
				Total:    0,
				Page:     1,
				PageSize: 20,
			}, nil
		},
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodGet, "/quotes", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body map[string]any
	_ = json.NewDecoder(w.Body).Decode(&body)
	if _, ok := body["items"]; !ok {
		t.Error("response missing items")
	}
	if _, ok := body["total"]; !ok {
		t.Error("response missing total")
	}
}

func TestList_FiltersForwarded(t *testing.T) {
	t.Parallel()

	var captured quotes.ListParams
	h := quotes.NewHandler(&fakeRepo{
		listFn: func(_ context.Context, p quotes.ListParams) (*quotes.ListResult, error) {
			captured = p
			return &quotes.ListResult{Items: []quotes.ListItem{}, Page: p.Page, PageSize: p.PageSize}, nil
		},
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodGet,
		"/quotes?date_from=2026-05-01&date_to=2026-05-31&sales_name=Peter&status=draft&page=2&page_size=10",
		nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if captured.DateFrom == nil || captured.DateFrom.Format("2006-01-02") != "2026-05-01" {
		t.Errorf("DateFrom = %v, want 2026-05-01", captured.DateFrom)
	}
	if captured.SalesName == nil || *captured.SalesName != "Peter" {
		t.Errorf("SalesName = %v, want Peter", captured.SalesName)
	}
	if captured.Status == nil || *captured.Status != "draft" {
		t.Errorf("Status = %v, want draft", captured.Status)
	}
	if captured.Page != 2 || captured.PageSize != 10 {
		t.Errorf("page=%d size=%d, want 2/10", captured.Page, captured.PageSize)
	}
}

// ─── GET /api/quotes/{id} ─────────────────────────────────────────────────

func TestGet_HappyPath_MergesExternalAndBody(t *testing.T) {
	t.Parallel()

	id := uuid.New()
	h := quotes.NewHandler(&fakeRepo{
		getFn: func(_ context.Context, _ uuid.UUID) (*quotes.Quote, error) {
			return &quotes.Quote{
				ID:            id,
				QuoteNo:       "AW-260516-001",
				Status:        "draft",
				Title:         "T",
				TotalAmount:   500,
				ClientCompany: "C",
				SalesName:     "S",
				Body:          json.RawMessage(`{"meta":{"x":1},"groups":[]}`),
				CreatedAt:     time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC),
				UpdatedAt:     time.Date(2026, 5, 16, 13, 0, 0, 0, time.UTC),
			}, nil
		},
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodGet, "/quotes/"+id.String(), nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 (body=%s)", w.Code, w.Body.String())
	}
	var body map[string]any
	_ = json.NewDecoder(w.Body).Decode(&body)
	if body["quote_no"] != "AW-260516-001" {
		t.Errorf("quote_no = %v", body["quote_no"])
	}
	if _, ok := body["meta"]; !ok {
		t.Error("merged body lost meta from JSONB")
	}
	if _, ok := body["groups"]; !ok {
		t.Error("merged body lost groups from JSONB")
	}
}

func TestGet_NotFound_404(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{
		getFn: func(_ context.Context, _ uuid.UUID) (*quotes.Quote, error) {
			return nil, quotes.ErrNotFound
		},
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodGet, "/quotes/"+uuid.New().String(), nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

// ─── DELETE /api/quotes/{id} ──────────────────────────────────────────────

func TestSoftDelete_HappyPath_204(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{
		softDeleteFn: func(_ context.Context, _ uuid.UUID) error { return nil },
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodDelete, "/quotes/"+uuid.New().String(), nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("status = %d, want 204", w.Code)
	}
	if body, _ := io.ReadAll(w.Body); len(body) != 0 {
		t.Errorf("body not empty: %s", body)
	}
}

func TestSoftDelete_NotFound_404(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{
		softDeleteFn: func(_ context.Context, _ uuid.UUID) error { return quotes.ErrNotFound },
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodDelete, "/quotes/"+uuid.New().String(), nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", w.Code)
	}
}

// ─── GET /api/quotes/distinct-sales ───────────────────────────────────────

func TestDistinctSales_HappyPath(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{
		distinctSalesFn: func(_ context.Context) ([]string, error) {
			return []string{"Alice", "Bob"}, nil
		},
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodGet, "/quotes/distinct-sales", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	var body []string
	_ = json.NewDecoder(w.Body).Decode(&body)
	if len(body) != 2 || body[0] != "Alice" {
		t.Errorf("body = %v, want [Alice Bob]", body)
	}
}

func TestDistinctSales_EmptyReturnsJsonArrayNotNull(t *testing.T) {
	t.Parallel()

	h := quotes.NewHandler(&fakeRepo{
		distinctSalesFn: func(_ context.Context) ([]string, error) { return []string{}, nil },
	})
	srv := mountWithAuth(h)

	req := httptest.NewRequest(http.MethodGet, "/quotes/distinct-sales", nil)
	w := httptest.NewRecorder()
	srv.ServeHTTP(w, req)

	// JSON 應該是 "[]" 不是 "null" (frontend 期望 array).
	bodyStr := strings.TrimSpace(w.Body.String())
	if bodyStr != "[]" {
		t.Errorf("body = %q, want %q", bodyStr, "[]")
	}
}
