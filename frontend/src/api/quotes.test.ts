import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nextQuoteNumber } from './quotes';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
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
