import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuoteProvider, useQuoteState } from '../../state/QuoteContext';
import { createBlankQuote } from '../../state/quoteReducer';
import type { Quote } from '../../state/quoteTypes';
import { EditModeBar } from './EditModeBar';

// Reads the live quote number out of context so a test can assert the
// server-allocated serial got stamped after a save.
function QuoteNoProbe() {
  const { state } = useQuoteState();
  return <span data-testid="qno">{state.meta.quoteNo}</span>;
}

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

// Option B: quote_no is the backend-allocated permanent ID, assigned at SAVE
// time (POST /quotes) — not on Builder mount. So a brand-new quote has no
// number yet, and 存到雲端 / 輸出 PDF stay ENABLED (the save allocates the
// number and stamps it into state). The legacy print flow still saves to the
// cloud BEFORE window.print(), so every PDF is persisted/reopenable and shows
// the freshly-allocated number.
describe('EditModeBar — 儲存 / 輸出 PDF gating + save-before-print', () => {
  it('keeps 存到雲端 / 輸出 PDF enabled for a brand-new numberless quote (save allocates the number)', () => {
    render(
      <QuoteProvider initial={seedWithQuoteNo('')}>
        <EditModeBar />
      </QuoteProvider>,
    );
    expect(screen.getByRole('button', { name: '存到雲端' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '輸出 PDF' })).toBeEnabled();
  });

  it('saving a brand-new numberless quote allocates + stamps the quote number into state', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(writeResponse());
    render(
      <QuoteProvider initial={seedWithQuoteNo('')}>
        <EditModeBar />
        <QuoteNoProbe />
      </QuoteProvider>,
    );
    // No number before save.
    expect(screen.getByTestId('qno').textContent).toBe('');
    await userEvent.click(screen.getByRole('button', { name: '存到雲端' }));
    // POST create → response quote_no stamped into state (shows in preview/PDF).
    await waitFor(() => expect(screen.getByTestId('qno').textContent).toBe('AW-260521-001'));
    expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('POST');
    fetchSpy.mockRestore();
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
  vi.unstubAllGlobals();
});

beforeEach(() => {
  document.title = 'ARTWAY 報價單系統';
});

describe('EditModeBar — 編輯預覽 MutationObserver guard', () => {
  it('does not observe when the preview root is missing', async () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const MutationObserverMock = vi.fn(() => ({
      observe,
      disconnect,
      takeRecords: () => [],
    }));
    vi.stubGlobal('MutationObserver', MutationObserverMock);

    render(
      <QuoteProvider initial={seedWithQuoteNo('AW-260521-001')}>
        <EditModeBar />
      </QuoteProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: '編輯預覽' }));
    await userEvent.click(
      within(screen.getByRole('dialog', { name: '編輯預覽提醒' })).getByRole('button', {
        name: '我了解了',
      }),
    );

    expect(screen.getByRole('button', { name: '✕ 結束編輯' })).toBeInTheDocument();
    expect(MutationObserverMock).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });
});
