import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, ApiError, API_BASE } from './client';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('apiFetch', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('prefixes paths with API_BASE and defaults to GET', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch('/quotes');
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_BASE}/quotes`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('serialises body as JSON and sets Content-Type', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    await apiFetch('/quotes', { method: 'POST', body: { title: 'X' } });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.body).toBe('{"title":"X"}');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns parsed JSON on 2xx', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ quote_no: 'AW-260518-001' }));
    const got = await apiFetch<{ quote_no: string }>('/quotes/next-number', { method: 'POST' });
    expect(got).toEqual({ quote_no: 'AW-260518-001' });
  });

  it('returns undefined for 204 No Content', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const got = await apiFetch<void>('/quotes/abc', { method: 'DELETE' });
    expect(got).toBeUndefined();
  });

  it('throws ApiError carrying status code on HTTP error', async () => {
    fetchSpy.mockResolvedValue(new Response('forbidden', { status: 403, statusText: 'Forbidden' }));
    await expect(apiFetch('/quotes')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });
  });

  it('surfaces backend error message when response body is JSON {error}', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'quote_no required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await expect(apiFetch('/quotes', { method: 'POST', body: {} })).rejects.toMatchObject({
      message: expect.stringContaining('quote_no required'),
      status: 400,
    } satisfies Partial<ApiError>);
  });

  it('forwards AbortSignal to fetch', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ ok: true }));
    const ctl = new AbortController();
    await apiFetch('/quotes', { signal: ctl.signal });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBe(ctl.signal);
  });
});
