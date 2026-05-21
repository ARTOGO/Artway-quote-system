import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuoteProvider, useQuoteState } from '../../state/QuoteContext';
import { createBlankQuote } from '../../state/quoteReducer';
import type { Quote } from '../../state/quoteTypes';
import { BuilderPanel } from './BuilderPanel';

// Option B: BuilderPanel no longer fetches a quote number on mount — the
// backend allocates the AW-... serial at SAVE time (see useSaveQuote /
// SET_SAVED). All that remains on mount is the one-shot date-init effect: a
// fresh blank quote gets today's issue/valid dates, while a loaded or
// user-edited quote is left untouched. These tests cover that effect.

function Probe() {
  const { state } = useQuoteState();
  return (
    <>
      <span data-testid="quote-no">{state.meta.quoteNo}</span>
      <span data-testid="issue-date">{state.meta.issueDate}</span>
      <span data-testid="valid-until">{state.meta.validUntil}</span>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Option B: no allocation on mount ─────────────────────────────────────

describe('BuilderPanel — no quote-number allocation on mount', () => {
  it('does NOT allocate a number on mount; a brand-new quote stays numberless until saved', async () => {
    render(
      <QuoteProvider>
        <BuilderPanel />
        <Probe />
      </QuoteProvider>,
    );
    // Give any mount effect a tick — the number must remain blank.
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId('quote-no').textContent).toBe('');
  });
});

// ─── F7: stale-date refresh on first Builder entry ────────────────────────

describe('BuilderPanel — date refresh on first Builder entry', () => {
  it('refreshes BOTH dates when issue date is stale (legacy rule: validUntil = issueDate + 15)', () => {
    // Provider seeded on day 1 (2026-05-18); user enters Builder on day 2.
    // Codex final F1: refreshing a stale issueDate MUST also refresh
    // validUntil from the new base, or the validity window silently shortens.
    const staleInitial: Quote = {
      ...createBlankQuote(),
      meta: { title: '', quoteNo: '', issueDate: '2026-05-18', validUntil: '2026-06-02' },
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 0, 5));

    render(
      <QuoteProvider initial={staleInitial}>
        <BuilderPanel />
        <Probe />
      </QuoteProvider>,
    );

    expect(screen.getByTestId('issue-date').textContent).toBe('2026-05-19');
    // validUntil realigned to issueDate + 15 (not preserved at yesterday+15)
    expect(screen.getByTestId('valid-until').textContent).toBe('2026-06-03');
  });

  it('realigns only validUntil when issueDate is current but validUntil is stale', () => {
    // issueDate is today (kept), validUntil in the past → realign to today+15.
    const partial: Quote = {
      ...createBlankQuote(),
      meta: { title: '', quoteNo: '', issueDate: '2026-05-19', validUntil: '2026-05-01' },
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 9, 0));

    render(
      <QuoteProvider initial={partial}>
        <BuilderPanel />
        <Probe />
      </QuoteProvider>,
    );

    expect(screen.getByTestId('issue-date').textContent).toBe('2026-05-19'); // unchanged
    expect(screen.getByTestId('valid-until').textContent).toBe('2026-06-03'); // today + 15
  });

  it('leaves a fresh blank quote (today / today+15) untouched', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 9, 0));

    render(
      <QuoteProvider initial={createBlankQuote()}>
        <BuilderPanel />
        <Probe />
      </QuoteProvider>,
    );

    expect(screen.getByTestId('issue-date').textContent).toBe('2026-05-19');
    expect(screen.getByTestId('valid-until').textContent).toBe('2026-06-03');
  });

  it('does NOT touch dates for a loaded / in-edit quote (quoteNo already set)', () => {
    const inProgress: Quote = {
      ...createBlankQuote(),
      meta: {
        title: '',
        quoteNo: 'AW-260101-042',
        issueDate: '2026-01-01',
        validUntil: '2026-01-16',
      },
    };
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 9, 0));

    render(
      <QuoteProvider initial={inProgress}>
        <BuilderPanel />
        <Probe />
      </QuoteProvider>,
    );

    // Loaded quote: dates preserved exactly, even though they're "stale".
    expect(screen.getByTestId('issue-date').textContent).toBe('2026-01-01');
    expect(screen.getByTestId('valid-until').textContent).toBe('2026-01-16');
  });
});

// ─── F13: date init is one-shot; user edits survive BuilderPanel remount ──

describe('BuilderPanel — date init is one-shot across remounts', () => {
  it('does NOT overwrite user-edited dates when BuilderPanel unmounts and remounts', async () => {
    function ProbeWithDateEdit() {
      const { state, setMeta } = useQuoteState();
      return (
        <>
          <span data-testid="probe-issue">{state.meta.issueDate}</span>
          <button
            type="button"
            data-testid="manual-edit"
            onClick={() => setMeta('issueDate', '2027-12-25')}
          >
            edit
          </button>
        </>
      );
    }

    // Provider always rendered (App-level); BuilderPanel mounted only when
    // `show` is true — mimics the hash-route Builder ⇄ History switch.
    function Harness({ show }: { show: boolean }) {
      return (
        <QuoteProvider>
          {show && <BuilderPanel />}
          <ProbeWithDateEdit />
        </QuoteProvider>
      );
    }

    const { rerender } = render(<Harness show={true} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('manual-edit'));
    expect(screen.getByTestId('probe-issue').textContent).toBe('2027-12-25');

    // Leave Builder (BuilderPanel unmounts, provider stays alive)
    rerender(<Harness show={false} />);
    expect(screen.getByTestId('probe-issue').textContent).toBe('2027-12-25');

    // Return to Builder (BuilderPanel remounts; datesInitialised already true)
    rerender(<Harness show={true} />);
    expect(screen.getByTestId('probe-issue').textContent).toBe('2027-12-25');
  });
});
