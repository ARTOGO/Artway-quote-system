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
