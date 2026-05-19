// Typed wrappers for the Quotes HTTP API.
//
// Session 1 only wires `nextQuoteNumber()` (the atomic serial allocator).
// PR 5 will add `createQuote / updateQuote / listQuotes / getQuote /
// deleteQuote / distinctSales` here. Backend contract:
// `docs/HISTORY_BACKEND_SPEC.md` §3.

import { apiFetch } from './client';

interface NextNumberResponse {
  quote_no: string;
}

/**
 * Reserve the next `AW-YYMMDD-NNN` quote number from the backend.
 *
 * The backend uses an atomic Postgres `INSERT ... ON CONFLICT DO UPDATE`
 * keyed on Asia/Taipei dateKey, so concurrent staff get distinct serials
 * (legacy fix: browser-local localStorage allowed two users to mint the
 * same AW-...-001 — Codex round 5 F9).
 *
 * Pass an `AbortSignal` to cancel in-flight requests (e.g. React 19
 * StrictMode dev double-mount cleanup).
 */
export async function nextQuoteNumber(signal?: AbortSignal): Promise<string> {
  const res = await apiFetch<NextNumberResponse>('/quotes/next-number', {
    method: 'POST',
    signal,
  });
  return res.quote_no;
}
