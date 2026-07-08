package quotes

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/ARTOGO/Artway-quote-system/backend/internal/auth"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
	maxBodyBytes    = 600 * 1024 // SPEC §6: up to 500KB body, 600KB header room
)

// validStatuses mirrors the DB CHECK constraint (migrations/0001 → 0002 → 0003).
// 'template' is a business-side pseudo-status: quotes tagged that way get
// pinned to the top of the History list so 業務 can quickly duplicate them.
// 'executed' was dropped in migration 0003 — the business lifecycle stops at
// signed; keeping executed around was confusing.
var validStatuses = map[string]bool{
	"draft":    true,
	"sent":     true,
	"signed":   true,
	"template": true,
}

// Handler is the HTTP layer for quotes. It depends on the Repository
// interface (not the concrete impl) so tests inject fakes.
type Handler struct {
	repo    Repository
	service *Service
	now     func() time.Time // testable clock (defaults to explicit Asia/Taipei)
}

// NewHandler wires Handler with a Repository and an Asia/Taipei clock.
func NewHandler(repo Repository) *Handler {
	return &Handler{repo: repo, service: NewService(repo), now: nowInTaipei}
}

// ─── /api/me ───────────────────────────────────────────────────────────────

// Me returns the IAP-authenticated user identity from request context.
// Handy for the frontend to display "logged in as peter@artogo.co" without
// exposing IAP-specific header parsing to the client.
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	email, err := auth.UserFromContext(r.Context())
	if err != nil {
		// Should be unreachable: Mount lives behind auth.Middleware.
		writeError(w, r, http.StatusUnauthorized, "no_user", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"email": email})
}

// ─── /api/quotes/next-number ───────────────────────────────────────────────

// NextNumber returns the next AW-YYMMDD-NNN. SPEC §3.1.
func (h *Handler) NextNumber(w http.ResponseWriter, r *http.Request) {
	n, err := h.repo.NextNumber(r.Context(), h.now())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "next_number_failed", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"quote_no": n})
}

// ─── /api/quotes (Create / List) ───────────────────────────────────────────

// quoteIn is the Create/Update JSON shape. Only the 7 indexed fields are
// parsed; everything else (meta / client / sales / groups / ...) is stored
// as-is in body JSONB per SPEC §4 black-box principle.
type quoteIn struct {
	QuoteNo       string `json:"quote_no"`
	Status        string `json:"status"`
	Title         string `json:"title"`
	TotalAmount   int64  `json:"total_amount"`
	ClientCompany string `json:"client_company"`
	SalesName     string `json:"sales_name"`
	IssueDate     string `json:"issue_date"` // "YYYY-MM-DD" or ""
}

// Create handles POST /api/quotes — SPEC §3.2.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	raw, err := readBody(r)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "read_body", err)
		return
	}

	var in quoteIn
	if err := json.Unmarshal(raw, &in); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_json", err)
		return
	}
	if err := validateIn(in, false /* quote_no allocated here if absent */); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_input", err)
		return
	}
	issueDate, err := parseDate(in.IssueDate)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_issue_date", err)
		return
	}

	user, _ := auth.UserFromContext(r.Context())

	result, err := h.service.CreateQuote(r.Context(), CreateParams{
		QuoteNo:       in.QuoteNo,
		Status:        in.Status,
		Title:         in.Title,
		TotalAmount:   in.TotalAmount,
		ClientCompany: in.ClientCompany,
		SalesName:     in.SalesName,
		IssueDate:     issueDate,
		Body:          raw, // 整包 JSON 原樣存
		UserEmail:     user,
	})
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "create_failed", err)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":         result.ID,
		"quote_no":   result.QuoteNo,
		"created_at": result.CreatedAt.UTC().Format(time.RFC3339),
		"updated_at": result.UpdatedAt.UTC().Format(time.RFC3339),
	})
}

// List handles GET /api/quotes — SPEC §3.4 (filter + pagination).
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	dateFrom, err := parseDateParam(q.Get("date_from"))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_date_from", err)
		return
	}
	dateTo, err := parseDateParam(q.Get("date_to"))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_date_to", err)
		return
	}

	page := parseIntDefault(q.Get("page"), 1)
	if page < 1 {
		page = 1
	}
	pageSize := parseIntDefault(q.Get("page_size"), defaultPageSize)
	if pageSize < 1 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}

	result, err := h.repo.List(r.Context(), ListParams{
		DateFrom:  dateFrom,
		DateTo:    dateTo,
		SalesName: nullableString(q.Get("sales_name")),
		Status:    nullableString(q.Get("status")),
		Page:      page,
		PageSize:  pageSize,
	})
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "list_failed", err)
		return
	}

	// Hand-shape JSON to match SPEC §3.4 exactly (snake_case, RFC3339 dates).
	items := make([]map[string]any, 0, len(result.Items))
	for _, it := range result.Items {
		items = append(items, map[string]any{
			"id":             it.ID,
			"quote_no":       it.QuoteNo,
			"status":         it.Status,
			"title":          it.Title,
			"total_amount":   it.TotalAmount,
			"client_company": it.ClientCompany,
			"sales_name":     it.SalesName,
			"issue_date":     dateString(it.IssueDate),
			"updated_at":     it.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":     items,
		"total":     result.Total,
		"page":      result.Page,
		"page_size": result.PageSize,
	})
}

// ─── /api/quotes/distinct-sales ────────────────────────────────────────────

// DistinctSales handles GET /api/quotes/distinct-sales. Added to SPEC v2.1
// (was missing in v2). Used by frontend history page sales-filter dropdown.
func (h *Handler) DistinctSales(w http.ResponseWriter, r *http.Request) {
	names, err := h.repo.DistinctSales(r.Context())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "distinct_sales_failed", err)
		return
	}
	writeJSON(w, http.StatusOK, names)
}

// ─── /api/quotes/{id} (Get / Update / SoftDelete) ──────────────────────────

// Get handles GET /api/quotes/{id} — SPEC §3.5.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_id", err)
		return
	}

	q, err := h.repo.Get(r.Context(), id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "not_found", err)
			return
		}
		writeError(w, r, http.StatusInternalServerError, "get_failed", err)
		return
	}

	writeMergedQuote(w, r, q)
}

// GetByNumber handles GET /api/quotes/by-number/{quote_no}. Reopens a quote by
// its 報價單號 so業務 deep-link bookmarks (#/quote/AW-...) keep working — the
// frontend route carries the quote_no, not the internal UUID. Same merged shape
// as Get (SPEC §3.5a).
func (h *Handler) GetByNumber(w http.ResponseWriter, r *http.Request) {
	quoteNo := chi.URLParam(r, "quote_no")
	if quoteNo == "" {
		writeError(w, r, http.StatusBadRequest, "invalid_quote_no", errors.New("empty quote_no"))
		return
	}

	q, err := h.repo.GetByQuoteNo(r.Context(), quoteNo)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "not_found", err)
			return
		}
		writeError(w, r, http.StatusInternalServerError, "get_failed", err)
		return
	}

	writeMergedQuote(w, r, q)
}

// writeMergedQuote merges the 7 canonical columns (+ id / audit fields) back
// onto the stored body JSON and writes it (SPEC §4.3 stash-and-merge). Shared
// by Get and GetByNumber so both deep-link paths return an identical shape.
func writeMergedQuote(w http.ResponseWriter, r *http.Request, q *Quote) {
	var merged map[string]json.RawMessage
	if len(q.Body) > 0 {
		if err := json.Unmarshal(q.Body, &merged); err != nil {
			// 不該發生 — body 是 INSERT 時自家寫的 JSON。Log + return raw.
			slog.ErrorContext(r.Context(), "body unmarshal failed",
				"quote_id", q.ID, "error", err)
			merged = map[string]json.RawMessage{}
		}
	} else {
		merged = map[string]json.RawMessage{}
	}

	setRaw := func(key string, v any) {
		b, _ := json.Marshal(v)
		merged[key] = b
	}
	setRaw("id", q.ID)
	setRaw("quote_no", q.QuoteNo)
	setRaw("status", q.Status)
	setRaw("title", q.Title)
	setRaw("total_amount", q.TotalAmount)
	setRaw("client_company", q.ClientCompany)
	setRaw("sales_name", q.SalesName)
	setRaw("issue_date", dateString(q.IssueDate))
	setRaw("created_by", q.CreatedBy)
	setRaw("updated_by", q.UpdatedBy)
	setRaw("created_at", q.CreatedAt.UTC().Format(time.RFC3339))
	setRaw("updated_at", q.UpdatedAt.UTC().Format(time.RFC3339))

	writeJSON(w, http.StatusOK, merged)
}

// Update handles PUT /api/quotes/{id} — SPEC §3.3. quote_no in body is
// ignored (immutable per SPEC).
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_id", err)
		return
	}

	raw, err := readBody(r)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "read_body", err)
		return
	}

	var in quoteIn
	if err := json.Unmarshal(raw, &in); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_json", err)
		return
	}
	if err := validateIn(in, false /* update ignores quote_no */); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_input", err)
		return
	}
	issueDate, err := parseDate(in.IssueDate)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_issue_date", err)
		return
	}

	user, _ := auth.UserFromContext(r.Context())

	result, err := h.repo.Update(r.Context(), id, UpdateParams{
		Status:        in.Status,
		Title:         in.Title,
		TotalAmount:   in.TotalAmount,
		ClientCompany: in.ClientCompany,
		SalesName:     in.SalesName,
		IssueDate:     issueDate,
		Body:          raw,
		UserEmail:     user,
	})
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "not_found", err)
			return
		}
		writeError(w, r, http.StatusInternalServerError, "update_failed", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":         result.ID,
		"updated_at": result.UpdatedAt.UTC().Format(time.RFC3339),
	})
}

// SoftDelete handles DELETE /api/quotes/{id} — SPEC §3.6.
func (h *Handler) SoftDelete(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_id", err)
		return
	}

	if err := h.repo.SoftDelete(r.Context(), id); err != nil {
		if errors.Is(err, ErrNotFound) {
			writeError(w, r, http.StatusNotFound, "not_found", err)
			return
		}
		writeError(w, r, http.StatusInternalServerError, "delete_failed", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ─── helpers ──────────────────────────────────────────────────────────────

func readBody(r *http.Request) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r.Body, maxBodyBytes))
}

func parseID(r *http.Request) (uuid.UUID, error) {
	return uuid.Parse(chi.URLParam(r, "id"))
}

func validateIn(in quoteIn, requireQuoteNo bool) error {
	if requireQuoteNo && in.QuoteNo == "" {
		return errors.New("quote_no required")
	}
	if !validStatuses[in.Status] {
		return errors.New("status must be one of draft/sent/signed/template")
	}
	return nil
}

func parseDate(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func parseDateParam(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func parseIntDefault(s string, def int32) int32 {
	if s == "" {
		return def
	}
	n, err := strconv.ParseInt(s, 10, 32)
	if err != nil {
		return def
	}
	return int32(n)
}

func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func dateString(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		slog.Error("writeJSON encode failed", "error", err)
	}
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code string, err error) {
	slog.WarnContext(r.Context(), "request failed",
		"status", status, "code", code, "error", err, "path", r.URL.Path, "method", r.Method)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"error": err.Error(),
		"code":  code,
	})
}
