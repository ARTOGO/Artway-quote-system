import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuoteProvider, useQuoteState } from './QuoteContext';
import type { Quote } from './quoteTypes';

function wrapper({ children }: { children: ReactNode }) {
  return <QuoteProvider>{children}</QuoteProvider>;
}

describe('useQuoteState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 18));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when used outside QuoteProvider', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useQuoteState())).toThrow(/QuoteProvider/);
    errSpy.mockRestore();
  });

  it('exposes initial blank state', () => {
    const { result } = renderHook(() => useQuoteState(), { wrapper });
    expect(result.current.state.status).toBe('draft');
    expect(result.current.state.meta.issueDate).toBe('2026-05-18');
  });

  it('setStatus updates state', () => {
    const { result } = renderHook(() => useQuoteState(), { wrapper });
    act(() => result.current.setStatus('sent'));
    expect(result.current.state.status).toBe('sent');
  });

  it('setMeta updates a single meta field', () => {
    const { result } = renderHook(() => useQuoteState(), { wrapper });
    act(() => result.current.setMeta('title', 'My Quote'));
    expect(result.current.state.meta.title).toBe('My Quote');
  });

  it('setClient and setSales update independently', () => {
    const { result } = renderHook(() => useQuoteState(), { wrapper });
    act(() => {
      result.current.setClient('company', 'TWAA');
      result.current.setSales('name', 'Peter');
    });
    expect(result.current.state.client.company).toBe('TWAA');
    expect(result.current.state.sales.name).toBe('Peter');
  });

  it('reset() with no arg restores a fresh blank quote', () => {
    const { result } = renderHook(() => useQuoteState(), { wrapper });
    act(() => result.current.setMeta('title', 'X'));
    expect(result.current.state.meta.title).toBe('X');
    act(() => result.current.reset());
    expect(result.current.state.meta.title).toBe('');
  });

  it('load() replaces full state', () => {
    const { result } = renderHook(() => useQuoteState(), { wrapper });
    const loaded: Quote = {
      ...result.current.state,
      id: 'uuid-99',
      status: 'signed',
      meta: { ...result.current.state.meta, title: 'Loaded' },
    };
    act(() => result.current.load(loaded));
    expect(result.current.state.id).toBe('uuid-99');
    expect(result.current.state.meta.title).toBe('Loaded');
  });

  // ─── Session 3 helper functions ──────────────────────────────────────

  it('addDeliverable / updateDeliverable / removeDeliverable work end-to-end', () => {
    const { result } = renderHook(() => useQuoteState(), { wrapper });
    expect(result.current.state.deliverables).toEqual([]);

    act(() => result.current.addDeliverable('AR 立體攝影檔'));
    expect(result.current.state.deliverables).toEqual(['AR 立體攝影檔']);

    act(() => result.current.addDeliverable());
    expect(result.current.state.deliverables).toEqual(['AR 立體攝影檔', '']);

    act(() => result.current.updateDeliverable(1, '空間導覽'));
    expect(result.current.state.deliverables).toEqual(['AR 立體攝影檔', '空間導覽']);

    act(() => result.current.removeDeliverable(0));
    expect(result.current.state.deliverables).toEqual(['空間導覽']);
  });

  it('addNote / updateNote / removeNote work end-to-end (atop the 3 seeded notes)', () => {
    const { result } = renderHook(() => useQuoteState(), { wrapper });
    // Fresh quote already has 3 default disclaimer notes (legacy parity).
    expect(result.current.state.notes).toHaveLength(3);

    act(() => result.current.addNote('first'));
    act(() => result.current.addNote('second'));
    expect(result.current.state.notes).toHaveLength(5);
    expect(result.current.state.notes[3]).toBe('first');
    expect(result.current.state.notes[4]).toBe('second');

    act(() => result.current.updateNote(3, 'updated'));
    expect(result.current.state.notes[3]).toBe('updated');

    act(() => result.current.removeNote(4));
    expect(result.current.state.notes).toHaveLength(4);
    expect(result.current.state.notes[3]).toBe('updated');
  });

  it('setPayment updates one field at a time without touching siblings', () => {
    const { result } = renderHook(() => useQuoteState(), { wrapper });
    act(() => result.current.setPayment('terms', '簽約 50% / 驗收 50%'));
    expect(result.current.state.payment.terms).toBe('簽約 50% / 驗收 50%');
    // legacy defaults still in place
    expect(result.current.state.payment.currency).toBe('新台幣 NTD');
    expect(result.current.state.payment.method).toBe('銀行轉帳');
  });

  it('integrates with userEvent — typing into an input updates state', async () => {
    // user-event's internal scheduling fights with the fake timers our outer
    // beforeEach installs; restore real timers for this one integration test.
    vi.useRealTimers();
    function Probe() {
      const { state, setMeta } = useQuoteState();
      return (
        <>
          <input
            data-testid="title"
            value={state.meta.title}
            onChange={(e) => setMeta('title', e.target.value)}
          />
          <output data-testid="echo">{state.meta.title}</output>
        </>
      );
    }
    render(
      <QuoteProvider>
        <Probe />
      </QuoteProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByTestId('title'), 'Hello');
    expect(screen.getByTestId('echo').textContent).toBe('Hello');
  });
});
