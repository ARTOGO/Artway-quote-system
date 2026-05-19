import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../api/client';
import { nextQuoteNumber } from '../../api/quotes';
import { QuoteProvider, useQuoteState } from '../../state/QuoteContext';
import { createBlankQuote } from '../../state/quoteReducer';
import type { Quote } from '../../state/quoteTypes';
import { BuilderPanel } from './BuilderPanel';

// ─── Module mock ──────────────────────────────────────────────────────────
// Mock the api/quotes module so tests don't hit the network. The
// underlying `apiFetch` (client.ts) is exercised by api/client.test.ts.
vi.mock('../../api/quotes', () => ({
  nextQuoteNumber: vi.fn(),
}));

const mockNextQuoteNumber = vi.mocked(nextQuoteNumber);

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

beforeEach(() => {
  mockNextQuoteNumber.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── F9: backend allocates the atomic AW- serial ─────────────────────────

describe('BuilderPanel — quote number allocation', () => {
  it('calls POST /api/quotes/next-number on mount and shows the returned number', async () => {
    mockNextQuoteNumber.mockResolvedValue('AW-260518-001');

    render(
      <QuoteProvider>
        <BuilderPanel />
        <Probe />
      </QuoteProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('quote-no').textContent).toBe('AW-260518-001');
    });
    expect(mockNextQuoteNumber).toHaveBeenCalled();
  });

  it('passes an AbortSignal so StrictMode unmount can cancel the in-flight request', async () => {
    mockNextQuoteNumber.mockResolvedValue('AW-260518-001');
    render(
      <QuoteProvider>
        <BuilderPanel />
      </QuoteProvider>,
    );
    await waitFor(() => expect(mockNextQuoteNumber).toHaveBeenCalled());
    const signal = mockNextQuoteNumber.mock.calls[0]?.[0];
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('does NOT call the backend if state.meta.quoteNo is already set (load / in-edit)', async () => {
    const inProgress: Quote = {
      ...createBlankQuote(),
      meta: {
        title: '',
        quoteNo: 'AW-260101-042',
        issueDate: '2026-01-01',
        validUntil: '2026-01-16',
      },
    };

    render(
      <QuoteProvider initial={inProgress}>
        <BuilderPanel />
        <Probe />
      </QuoteProvider>,
    );

    // Give the effect a tick — it should bail out without calling the API
    await new Promise((r) => setTimeout(r, 10));
    expect(mockNextQuoteNumber).not.toHaveBeenCalled();
    expect(screen.getByTestId('quote-no').textContent).toBe('AW-260101-042');
  });
});

// ─── F7: stale-date refresh (still valid post-F9) ─────────────────────────

describe('BuilderPanel — date refresh on first Builder entry', () => {
  it('refreshes BOTH dates when issue date is stale (legacy rule: validUntil = issueDate + 15)', async () => {
    // Provider mounted on day 1 (2026-05-18) with default dates:
    //   issueDate=2026-05-18 (today on day 1)
    //   validUntil=2026-06-02 (today+15 on day 1)
    // User enters Builder on day 2 (2026-05-19).
    //
    // Codex final F1 fix: when refreshing a stale issueDate we MUST also
    // refresh validUntil from the new base, or the quote validity window
    // shortens by a day. Legacy `newQuoteAction` couples them.
    //   - issueDate '2026-05-18' < '2026-05-19' → refresh to '2026-05-19'
    //   - validUntil → refresh to '2026-06-03' (today + 15)
    const staleInitial: Quote = {
      ...createBlankQuote(),
      meta: {
        title: '',
        quoteNo: '',
        issueDate: '2026-05-18',
        validUntil: '2026-06-02',
      },
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 0, 5));
    mockNextQuoteNumber.mockResolvedValue('AW-260519-001');

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
});

// ─── F9: error surfacing when backend is unreachable ──────────────────────

describe('BuilderPanel — backend error UX', () => {
  it('renders an inline error banner when nextQuoteNumber rejects', async () => {
    mockNextQuoteNumber.mockRejectedValue(new ApiError('Service Unavailable', 503));

    render(
      <QuoteProvider>
        <BuilderPanel />
      </QuoteProvider>,
    );

    const banner = await screen.findByTestId('api-error');
    expect(banner).toHaveTextContent('後端錯誤');
    expect(banner).toHaveTextContent('503');
  });

  it('does NOT render the error banner if the request was aborted (StrictMode cleanup)', async () => {
    const abortErr = new DOMException('aborted', 'AbortError');
    mockNextQuoteNumber.mockRejectedValue(abortErr);

    render(
      <QuoteProvider>
        <BuilderPanel />
      </QuoteProvider>,
    );

    // Give the rejection a tick to propagate
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByTestId('api-error')).toBeNull();
  });

  it('surfaces a generic network error message when fetch throws a TypeError', async () => {
    mockNextQuoteNumber.mockRejectedValue(new TypeError('Failed to fetch'));

    render(
      <QuoteProvider>
        <BuilderPanel />
      </QuoteProvider>,
    );

    const banner = await screen.findByTestId('api-error');
    expect(banner).toHaveTextContent('後端無法連線');
  });

  // ─── F10: retry button actually re-fires the allocation effect ─────────
  it('clicking the Retry button re-invokes nextQuoteNumber after a failure', async () => {
    // First call: rejects with 503; second call: resolves.
    mockNextQuoteNumber
      .mockRejectedValueOnce(new ApiError('db down', 503))
      .mockResolvedValueOnce('AW-260518-042');

    render(
      <QuoteProvider>
        <BuilderPanel />
        <Probe />
      </QuoteProvider>,
    );

    // 1st mount: error banner shows
    const retryBtn = await screen.findByTestId('api-retry');
    expect(screen.getByTestId('api-error')).toHaveTextContent('503');
    expect(screen.getByTestId('quote-no').textContent).toBe('');

    // Click Retry → effect re-runs → second mock returns the number
    const user = userEvent.setup();
    await user.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('quote-no').textContent).toBe('AW-260518-042');
    });
    expect(screen.queryByTestId('api-error')).toBeNull();
    expect(mockNextQuoteNumber).toHaveBeenCalledTimes(2);
  });

  it('does NOT render a Retry button when no error is present', () => {
    mockNextQuoteNumber.mockResolvedValue('AW-260518-001');
    render(
      <QuoteProvider>
        <BuilderPanel />
      </QuoteProvider>,
    );
    expect(screen.queryByTestId('api-retry')).toBeNull();
  });

  // ─── F11: retry must NOT overwrite user-edited dates ──────────────────
  it('preserves user-edited issueDate/validUntil when Retry re-fires the fetch', async () => {
    // 1st call rejects → user edits dates manually → 2nd call resolves.
    mockNextQuoteNumber
      .mockRejectedValueOnce(new ApiError('db down', 503))
      .mockResolvedValueOnce('AW-260518-007');

    function ProbeWithDateEdit() {
      const { state, setMeta } = useQuoteState();
      return (
        <>
          <span data-testid="probe-issue">{state.meta.issueDate}</span>
          <span data-testid="probe-valid">{state.meta.validUntil}</span>
          <button
            type="button"
            data-testid="manual-edit"
            onClick={() => {
              setMeta('issueDate', '2027-12-25');
              setMeta('validUntil', '2028-01-09');
            }}
          >
            edit dates
          </button>
        </>
      );
    }

    render(
      <QuoteProvider>
        <BuilderPanel />
        <ProbeWithDateEdit />
      </QuoteProvider>,
    );

    // 1st mount: error shown, dates seeded to today via initial effect
    await screen.findByTestId('api-retry');

    // User edits dates manually
    const user = userEvent.setup();
    await user.click(screen.getByTestId('manual-edit'));
    expect(screen.getByTestId('probe-issue').textContent).toBe('2027-12-25');
    expect(screen.getByTestId('probe-valid').textContent).toBe('2028-01-09');

    // Click Retry → 2nd fetch succeeds, dates MUST be preserved
    await user.click(screen.getByTestId('api-retry'));
    await waitFor(() => expect(mockNextQuoteNumber).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId('probe-issue').textContent).toBe('2027-12-25');
    expect(screen.getByTestId('probe-valid').textContent).toBe('2028-01-09');
  });

  // ─── F13: BuilderPanel re-entry preserves user-edited future dates ────
  it('does NOT overwrite future-dated edits when BuilderPanel unmounts and remounts', async () => {
    // Simulate App-level provider (alive across navigation) + BuilderPanel
    // toggling visibility on hash routes Builder ⇄ History ⇄ Builder.
    mockNextQuoteNumber.mockRejectedValue(new ApiError('db down', 503));

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

    // Toggle wrapper: provider always rendered; BuilderPanel mounted only
    // when `show` is true. Mimics the App-level provider + route switch.
    function Harness({ show }: { show: boolean }) {
      return (
        <QuoteProvider>
          {show && <BuilderPanel />}
          <ProbeWithDateEdit />
          <span data-testid="show-flag">{String(show)}</span>
        </QuoteProvider>
      );
    }

    const { rerender } = render(<Harness show={true} />);
    await screen.findByTestId('api-error');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('manual-edit'));
    expect(screen.getByTestId('probe-issue').textContent).toBe('2027-12-25');

    // Leave Builder (BuilderPanel unmounts, provider stays)
    rerender(<Harness show={false} />);
    expect(screen.queryByTestId('api-error')).toBeNull();
    expect(screen.getByTestId('probe-issue').textContent).toBe('2027-12-25');

    // Return to Builder (BuilderPanel remounts, allocation effect re-runs)
    rerender(<Harness show={true} />);
    expect(screen.getByTestId('probe-issue').textContent).toBe('2027-12-25');
  });

  // ─── F15: preserve back-dated edits across retry (Codex round 9) ─────
  it('preserves user-edited PAST dates when Retry re-fires the fetch', async () => {
    // Codex round 9: a previous `< today` staleness check would overwrite
    // legitimately back-dated quotes. The datesInitialised flag now
    // freezes the dates after first auto-populate, so any subsequent user
    // edit — past, today, or future — survives Retry.
    mockNextQuoteNumber
      .mockRejectedValueOnce(new ApiError('db down', 503))
      .mockResolvedValueOnce('AW-260518-077');

    function ProbeWithBackdate() {
      const { state, setMeta } = useQuoteState();
      return (
        <>
          <span data-testid="probe-issue">{state.meta.issueDate}</span>
          <button
            type="button"
            data-testid="manual-backdate"
            onClick={() => setMeta('issueDate', '2025-12-31')}
          >
            backdate
          </button>
        </>
      );
    }

    render(
      <QuoteProvider>
        <BuilderPanel />
        <ProbeWithBackdate />
      </QuoteProvider>,
    );

    await screen.findByTestId('api-retry');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('manual-backdate'));
    expect(screen.getByTestId('probe-issue').textContent).toBe('2025-12-31');

    // Click Retry → 2nd fetch succeeds → back-dated edit MUST survive
    await user.click(screen.getByTestId('api-retry'));
    await waitFor(() => expect(mockNextQuoteNumber).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId('probe-issue').textContent).toBe('2025-12-31');
  });

  // ─── F14: "+ 新報價" when in error state must re-fire allocation ──────
  it('newQuote() triggers a fresh allocation even when state.meta.quoteNo was already empty', async () => {
    // Initial fetch fails. User clicks `+ 新報價` (via context.newQuote)
    // — even though state.meta.quoteNo was already '', the fetchToken
    // bump in QuoteContext forces the allocation effect to re-run.
    mockNextQuoteNumber
      .mockRejectedValueOnce(new ApiError('db down', 503))
      .mockResolvedValueOnce('AW-260518-099');

    function NewQuoteTrigger() {
      const { newQuote } = useQuoteState();
      return (
        <button type="button" data-testid="trigger-new" onClick={newQuote}>
          new quote
        </button>
      );
    }

    render(
      <QuoteProvider>
        <BuilderPanel />
        <NewQuoteTrigger />
        <Probe />
      </QuoteProvider>,
    );

    await screen.findByTestId('api-error');
    expect(mockNextQuoteNumber).toHaveBeenCalledTimes(1);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('trigger-new'));

    await waitFor(() => {
      expect(screen.getByTestId('quote-no').textContent).toBe('AW-260518-099');
    });
    expect(mockNextQuoteNumber).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('api-error')).toBeNull();
  });
});
