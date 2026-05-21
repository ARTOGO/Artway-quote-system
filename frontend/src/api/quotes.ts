// Typed wrappers for the Quotes HTTP API.
//
// Backend contract: docs/HISTORY_BACKEND_SPEC.md §3. The server externalises 7
// columns (quote_no / status / title / total_amount / client_company /
// sales_name / issue_date) and stores the whole request body as JSONB; GET
// merges the canonical columns back on top of the body, so the round-trip is
// symmetric. Mirrors the legacy MOCK CLOUD API (legacy.html:3242) it replaces.

import { calcGrandTotal } from '../lib/quoteCalc';
import type { Quote, QuoteStatus } from '../state/quoteTypes';
import { apiFetch } from './client';

interface NextNumberResponse {
  quote_no: string;
}

/**
 * Reserve the next `AW-YYMMDD-NNN` quote number from the backend (atomic
 * Postgres `INSERT ... ON CONFLICT`, so concurrent staff get distinct serials).
 * Pass an `AbortSignal` to cancel in-flight requests (StrictMode-safe).
 */
export async function nextQuoteNumber(signal?: AbortSignal): Promise<string> {
  const res = await apiFetch<NextNumberResponse>('/quotes/next-number', {
    method: 'POST',
    signal,
  });
  return res.quote_no;
}

// ─── Payload (POST / PUT body) ─────────────────────────────────────────────

/** The request body: full quote state + the 7 externalised columns. */
export type QuotePayload = Quote & {
  quote_no: string;
  status: QuoteStatus;
  title: string;
  total_amount: number;
  client_company: string;
  sales_name: string;
  issue_date: string;
};

/** Externalise the 7 server columns from quote state (legacy create, line 3288). */
export function toQuotePayload(quote: Quote): QuotePayload {
  return {
    ...quote,
    quote_no: quote.meta.quoteNo,
    status: quote.status,
    title: quote.meta.title,
    // Round to an integer: the backend column is int64 and rejects JSON
    // decimals, and a decimal final adjustment would otherwise make saving fail
    // (legacy calcQuoteTotal rounded before building the payload — Codex P2).
    total_amount: Math.round(calcGrandTotal(quote.groups)),
    client_company: quote.client.company,
    sales_name: quote.sales.name,
    issue_date: quote.meta.issueDate,
  };
}

/** POST /api/quotes response (SPEC §3.2). */
export interface CreateResult {
  id: string;
  quote_no: string;
  created_at: string;
  updated_at: string;
}

/** PUT /api/quotes/{id} response — only id + updated_at (SPEC §3.3, handler.go). */
export interface UpdateResult {
  id: string;
  updated_at: string;
}

/** Shared subset both write paths return — all `save` callers need is `id`. */
export type SaveResult = CreateResult | UpdateResult;

/** POST /api/quotes — persist a new quote. */
export async function createQuote(quote: Quote, signal?: AbortSignal): Promise<CreateResult> {
  return apiFetch<CreateResult>('/quotes', { method: 'POST', body: toQuotePayload(quote), signal });
}

/** PUT /api/quotes/{id} — update an existing quote (quote_no is immutable server-side). */
export async function updateQuote(
  id: string,
  quote: Quote,
  signal?: AbortSignal,
): Promise<UpdateResult> {
  return apiFetch<UpdateResult>(`/quotes/${id}`, {
    method: 'PUT',
    body: toQuotePayload(quote),
    signal,
  });
}

// ─── List (history page) ───────────────────────────────────────────────────

export interface QuoteListItem {
  id: string;
  quote_no: string;
  status: QuoteStatus;
  title: string;
  total_amount: number;
  client_company: string;
  sales_name: string;
  issue_date: string;
  updated_at: string;
}

export interface QuoteListResult {
  items: QuoteListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ListQuotesParams {
  dateFrom?: string;
  dateTo?: string;
  salesName?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/** GET /api/quotes — filtered, paginated metadata list (legacy MOCK.list). */
export async function listQuotes(
  params: ListQuotesParams = {},
  signal?: AbortSignal,
): Promise<QuoteListResult> {
  const qs = new URLSearchParams();
  if (params.dateFrom) qs.set('date_from', params.dateFrom);
  if (params.dateTo) qs.set('date_to', params.dateTo);
  if (params.salesName) qs.set('sales_name', params.salesName);
  if (params.status) qs.set('status', params.status);
  if (params.page) qs.set('page', String(params.page));
  if (params.pageSize) qs.set('page_size', String(params.pageSize));
  const query = qs.toString();
  return apiFetch<QuoteListResult>(`/quotes${query ? `?${query}` : ''}`, { signal });
}

// ─── Get / Delete / DistinctSales ──────────────────────────────────────────

/**
 * Reconstruct a `Quote` from the GET response. The body carries the full
 * camelCase state; the canonical outer columns (id / quote_no / status) win
 * over any stale duplicates inside the saved body (legacy merge, handler Get).
 */
export function fromQuoteResponse(raw: Record<string, unknown>): Quote {
  const body = raw as Partial<Quote> & {
    id?: string | null;
    quote_no?: string;
    status?: QuoteStatus;
    title?: string;
    client_company?: string;
    sales_name?: string;
    issue_date?: string;
    meta?: Quote['meta'] & { issue_date?: string; valid_until?: string };
  };
  const meta = (body.meta ?? ({} as Quote['meta'])) as Quote['meta'] & {
    issue_date?: string;
    valid_until?: string;
  };
  const client = (body.client ?? ({} as Quote['client'])) as Quote['client'];
  const sales = (body.sales ?? ({} as Quote['sales'])) as Quote['sales'];
  return {
    ...(body as Quote),
    id: body.id ?? null,
    status: body.status as QuoteStatus,
    // Mirror ALL canonical outer columns into the nested state — they are the
    // authoritative values the History list shows. Without this, reopening a
    // quote whose body diverged from the columns would display + re-save stale
    // title / company / sales-name (Codex P2). ?? preserves intentional ''.
    meta: {
      ...meta,
      quoteNo: body.quote_no ?? meta.quoteNo,
      title: body.title ?? meta.title ?? '',
      // issue_date is authoritative including a cleared '' — ?? not ||, so the
      // legacy snake_case fallback only fires when the field is truly absent
      // (a raw legacy body), never resurrecting a deliberately-cleared date.
      issueDate: body.issue_date ?? meta.issueDate ?? meta.issue_date ?? '',
      validUntil: meta.validUntil ?? meta.valid_until ?? '',
    },
    client: { ...client, company: body.client_company ?? client.company ?? '' },
    sales: { ...sales, name: body.sales_name ?? sales.name ?? '' },
  };
}

/** GET /api/quotes/{id} — reopen a saved quote into the Builder. */
export async function getQuote(id: string, signal?: AbortSignal): Promise<Quote> {
  const raw = await apiFetch<Record<string, unknown>>(`/quotes/${id}`, { signal });
  return fromQuoteResponse(raw);
}

/** DELETE /api/quotes/{id} — soft delete (204 No Content). */
export async function deleteQuote(id: string, signal?: AbortSignal): Promise<void> {
  await apiFetch<void>(`/quotes/${id}`, { method: 'DELETE', signal });
}

/** GET /api/quotes/distinct-sales — sales-name filter options (bare string[]). */
export async function distinctSales(signal?: AbortSignal): Promise<string[]> {
  return apiFetch<string[]>('/quotes/distinct-sales', { signal });
}
