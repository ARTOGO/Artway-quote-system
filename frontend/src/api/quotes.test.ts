import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBlankQuote } from '../state/quoteReducer';
import type { Quote } from '../state/quoteTypes';
import {
  createQuote,
  deleteQuote,
  distinctSales,
  fromQuoteResponse,
  getQuote,
  getQuoteByNumber,
  listQuotes,
  nextQuoteNumber,
  toQuotePayload,
  updateQuote,
} from './quotes';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

// A populated quote for payload / round-trip assertions.
function sampleQuote(): Quote {
  const q = createBlankQuote();
  q.status = 'sent';
  q.meta.quoteNo = 'AW-260521-001';
  q.meta.title = '專案X';
  q.meta.issueDate = '2026-05-21';
  q.client.company = '客戶Y';
  q.sales.name = '業務Z';
  q.groups[0].items.push({
    id: 'i1',
    sub_group: 'A-1',
    name: 'x',
    unit: '式',
    qty: 1,
    unitPrice: 10000,
  });
  return q;
}

describe('nextQuoteNumber', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs to /api/quotes/next-number and returns the quote_no string', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ quote_no: 'AW-260518-001' }));
    const no = await nextQuoteNumber();
    expect(no).toBe('AW-260518-001');
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/quotes/next-number',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('forwards AbortSignal so the caller can cancel', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ quote_no: 'AW-260518-002' }));
    const ctl = new AbortController();
    await nextQuoteNumber(ctl.signal);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBe(ctl.signal);
  });

  it('propagates HTTP errors via ApiError (so callers can surface to UI)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'db down' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(nextQuoteNumber()).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
    });
  });
});

describe('toQuotePayload', () => {
  it('externalizes the 7 backend columns from quote state', () => {
    const p = toQuotePayload(sampleQuote());
    expect(p.quote_no).toBe('AW-260521-001');
    expect(p.status).toBe('sent');
    expect(p.title).toBe('專案X');
    expect(p.client_company).toBe('客戶Y');
    expect(p.sales_name).toBe('業務Z');
    expect(p.issue_date).toBe('2026-05-21');
    expect(p.total_amount).toBe(10500); // 10000 subtotal + 5% tax
  });

  it('carries the full quote state as the body (backend stores raw JSON)', () => {
    const p = toQuotePayload(sampleQuote());
    expect(p.meta.quoteNo).toBe('AW-260521-001');
    expect(p.groups[0].items).toHaveLength(1);
    expect(p.client.company).toBe('客戶Y');
  });

  it('rounds total_amount to an integer (backend int64 rejects decimals, Codex P2)', () => {
    const q = sampleQuote();
    // a decimal final adjustment makes calcGrandTotal fractional (10000 + 500 tax − 0.5)
    q.groups[0].hasAdjustment = true;
    q.groups[0].adjustment = { label: '議價', amount: -0.5 };
    const p = toQuotePayload(q);
    expect(Number.isInteger(p.total_amount)).toBe(true);
    expect(p.total_amount).toBe(10500);
  });
});

describe('fromQuoteResponse', () => {
  it('reconstructs a Quote, preferring canonical outer quote_no / status / id', () => {
    const base = createBlankQuote();
    const serverBody = {
      ...base,
      id: 'uuid-1',
      quote_no: 'AW-260521-009',
      status: 'signed',
      // body's stale camelCase meta.quoteNo must be overridden by canonical value
      meta: { ...base.meta, quoteNo: 'AW-OLD' },
    };
    const q = fromQuoteResponse(serverBody);
    expect(q.id).toBe('uuid-1');
    expect(q.status).toBe('signed');
    expect(q.meta.quoteNo).toBe('AW-260521-009');
    expect(q.groups).toEqual(base.groups);
  });

  it('canonical issue_date wins; absent camelCase falls back to legacy snake_case (Codex P2)', () => {
    const base = createBlankQuote();
    const serverBody = {
      ...base,
      id: 'uuid-2',
      quote_no: 'AW-260521-010',
      status: 'draft',
      issue_date: '2026-05-21', // canonical server column (top level)
      // legacy-shaped meta: NO camelCase issueDate/validUntil, only snake_case
      meta: {
        quoteNo: 'AW-260521-010',
        title: '',
        issue_date: '2026-05-20', // stale legacy (loses to canonical)
        valid_until: '2026-06-04', // only source for validUntil
      },
    };
    const q = fromQuoteResponse(serverBody);
    expect(q.meta.issueDate).toBe('2026-05-21'); // canonical beats stale legacy
    expect(q.meta.validUntil).toBe('2026-06-04'); // camelCase absent → legacy snake_case
  });

  it('keeps an intentionally-cleared date cleared (no legacy resurrection, Codex P2)', () => {
    const base = createBlankQuote();
    const serverBody = {
      ...base,
      id: 'uuid-3',
      quote_no: 'AW-260521-011',
      status: 'draft',
      issue_date: '', // canonical cleared by the user
      meta: {
        quoteNo: 'AW-260521-011',
        title: '',
        issueDate: '', // camelCase explicitly cleared
        validUntil: '',
        issue_date: '2026-05-20', // stale legacy must NOT resurrect
        valid_until: '2026-06-04',
      },
    };
    const q = fromQuoteResponse(serverBody);
    expect(q.meta.issueDate).toBe(''); // cleared stays cleared (?? preserves '')
    expect(q.meta.validUntil).toBe('');
  });

  it('mirrors canonical title / client_company / sales_name into nested state (Codex P2)', () => {
    const base = createBlankQuote();
    const serverBody = {
      ...base,
      id: 'uuid-4',
      quote_no: 'AW-260521-012',
      status: 'sent',
      title: '正式專案名',
      client_company: '正式客戶',
      sales_name: '正式業務',
      issue_date: '2026-05-21',
      // stale nested body values that must lose to the canonical columns
      meta: { ...base.meta, quoteNo: 'AW-260521-012', title: '舊標題' },
      client: { ...base.client, company: '舊客戶' },
      sales: { ...base.sales, name: '舊業務' },
    };
    const q = fromQuoteResponse(serverBody);
    expect(q.meta.title).toBe('正式專案名');
    expect(q.client.company).toBe('正式客戶');
    expect(q.sales.name).toBe('正式業務');
  });
});

describe('quotes CRUD', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('createQuote POSTs /api/quotes with the externalized payload', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(
        {
          id: 'uuid-1',
          quote_no: 'AW-260521-001',
          created_at: '2026-05-21T00:00:00Z',
          updated_at: '2026-05-21T00:00:00Z',
        },
        { status: 201 },
      ),
    );
    const res = await createQuote(sampleQuote());
    expect(res.id).toBe('uuid-1');
    const [path, init] = fetchSpy.mock.calls[0];
    expect(path).toBe('/api/quotes');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.quote_no).toBe('AW-260521-001');
    expect(body.total_amount).toBe(10500);
  });

  it('updateQuote PUTs /api/quotes/{id} (PUT returns only id + updated_at)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ id: 'uuid-1', updated_at: 'y' }));
    const res = await updateQuote('uuid-1', sampleQuote());
    expect(res).toEqual({ id: 'uuid-1', updated_at: 'y' });
    const [path, init] = fetchSpy.mock.calls[0];
    expect(path).toBe('/api/quotes/uuid-1');
    expect(init.method).toBe('PUT');
  });

  it('listQuotes GETs /api/quotes with filter + pagination query', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ items: [], total: 0, page: 2, page_size: 10 }));
    const res = await listQuotes({ salesName: '業務Z', status: 'sent', page: 2, pageSize: 10 });
    expect(res.page).toBe(2);
    const path = fetchSpy.mock.calls[0][0] as string;
    expect(path).toContain('/api/quotes?');
    expect(path).toContain('sales_name=');
    expect(path).toContain('status=sent');
    expect(path).toContain('page=2');
    expect(path).toContain('page_size=10');
  });

  it('listQuotes omits the query string when no params given', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, page_size: 20 }));
    await listQuotes();
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/quotes');
  });

  it('getQuote GETs /api/quotes/{id} and reconstructs the Quote', async () => {
    const base = createBlankQuote();
    fetchSpy.mockResolvedValue(
      jsonResponse({
        ...base,
        id: 'uuid-9',
        quote_no: 'AW-260521-009',
        status: 'signed',
        meta: { ...base.meta, quoteNo: 'AW-OLD' },
      }),
    );
    const q = await getQuote('uuid-9');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/quotes/uuid-9');
    expect(q.id).toBe('uuid-9');
    expect(q.status).toBe('signed');
    expect(q.meta.quoteNo).toBe('AW-260521-009');
  });

  it('getQuoteByNumber GETs /api/quotes/by-number/{quote_no} and reconstructs the Quote', async () => {
    const base = createBlankQuote();
    fetchSpy.mockResolvedValue(
      jsonResponse({
        ...base,
        id: 'uuid-9',
        quote_no: 'AW-260521-009',
        status: 'sent',
        meta: { ...base.meta, quoteNo: 'AW-OLD' },
      }),
    );
    const q = await getQuoteByNumber('AW-260521-009');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/quotes/by-number/AW-260521-009');
    expect(q.meta.quoteNo).toBe('AW-260521-009');
    expect(q.status).toBe('sent');
  });

  it('getQuoteByNumber URL-encodes the quote_no', async () => {
    const base = createBlankQuote();
    fetchSpy.mockResolvedValue(jsonResponse({ ...base, id: 'x', quote_no: 'AW/1 2', status: 'draft' }));
    await getQuoteByNumber('AW/1 2');
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/quotes/by-number/AW%2F1%202');
  });

  it('deleteQuote DELETEs /api/quotes/{id} (204 no-content)', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    await deleteQuote('uuid-1');
    const [path, init] = fetchSpy.mock.calls[0];
    expect(path).toBe('/api/quotes/uuid-1');
    expect(init.method).toBe('DELETE');
  });

  it('distinctSales GETs the bare string[] array', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(['Alice', 'Bob']));
    const names = await distinctSales();
    expect(names).toEqual(['Alice', 'Bob']);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/quotes/distinct-sales');
  });
});
