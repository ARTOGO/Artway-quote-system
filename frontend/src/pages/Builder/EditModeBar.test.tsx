import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuoteProvider } from '../../state/QuoteContext';
import { createBlankQuote } from '../../state/quoteReducer';
import type { Quote } from '../../state/quoteTypes';
import { EditModeBar } from './EditModeBar';

function seedWithQuoteNo(quoteNo: string): Quote {
  const base = createBlankQuote();
  return { ...base, meta: { ...base.meta, quoteNo } };
}

function writeResponse(): Response {
  return new Response(
    JSON.stringify({
      id: 'uuid-1',
      quote_no: 'AW-260521-001',
      created_at: '2026-05-21T00:00:00Z',
      updated_at: '2026-05-21T00:00:00Z',
    }),
    { status: 201, headers: { 'Content-Type': 'application/json' } },
  );
}

// Codex Phase-1 P2: quote_no is the backend-allocated permanent ID. Until
// /api/quotes/next-number lands it stays '' and the preview prints "—", so
// exporting / saving must be blocked. And the legacy print flow saves to the
// cloud BEFORE window.print(), so every PDF is persisted/reopenable.
describe('EditModeBar — 儲存 / 輸出 PDF gating + save-before-print', () => {
  it('disables 儲存 and 輸出 PDF until a quote number is allocated', () => {
    render(
      <QuoteProvider initial={seedWithQuoteNo('')}>
        <EditModeBar />
      </QuoteProvider>,
    );
    expect(screen.getByRole('button', { name: '存到雲端' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '輸出 PDF' })).toBeDisabled();
  });

  it('存到雲端 POSTs the quote to the cloud and flashes 已存到雲端', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(writeResponse());
    render(
      <QuoteProvider initial={seedWithQuoteNo('AW-260521-001')}>
        <EditModeBar />
      </QuoteProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: '存到雲端' }));
    expect(await screen.findByRole('button', { name: '已存到雲端' })).toBeInTheDocument();
    const [path, init] = fetchSpy.mock.calls[0];
    expect(path).toBe('/api/quotes');
    expect((init as RequestInit).method).toBe('POST');
    fetchSpy.mockRestore();
  });

  it('輸出 PDF runs the two-stage 存到雲端 → 輸出 PDF flow (saves before printing)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(writeResponse());
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(
      <QuoteProvider initial={seedWithQuoteNo('AW-260521-001')}>
        <EditModeBar />
      </QuoteProvider>,
    );

    // 1) Open the confirm — print must NOT have fired yet.
    await userEvent.click(screen.getByRole('button', { name: '輸出 PDF' }));
    const dialog = screen.getByRole('dialog', { name: '輸出 PDF' });
    expect(printSpy).not.toHaveBeenCalled();

    // 2) 存到雲端 — saves first (POST), then the button advances to 輸出 PDF.
    await userEvent.click(within(dialog).getByRole('button', { name: '存到雲端' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('POST');

    // 3) Now the dialog's primary button prints (scope to the dialog — the
    //    action bar also has a 輸出 PDF button).
    const printConfirm = await within(dialog).findByRole('button', { name: '輸出 PDF' });
    await userEvent.click(printConfirm);
    expect(printSpy).toHaveBeenCalledOnce();

    fetchSpy.mockRestore();
    printSpy.mockRestore();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  document.title = 'ARTWAY 報價單系統';
});
