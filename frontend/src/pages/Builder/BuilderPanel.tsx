// BuilderPanel — left-side scrollable form panel (Topbar + sections).
//
// Owns the one-time auto-allocation of the quote number when a brand-new
// blank quote is mounted (legacy.html line 3528-3554 `newQuote()`).
//
// ─── Quote-number allocation (Codex F9) ──────────────────────────────────
// We no longer mint AW-... numbers from browser localStorage: two staff
// members opening Builder on the same day would each cache `001` and ship
// duplicate permanent IDs. Numbers are now reserved atomically by the
// backend (`POST /api/quotes/next-number`, Postgres `INSERT ON CONFLICT`).
// AbortController cancels the request when StrictMode dev mode unmounts +
// remounts the component, so we don't leak a serial on the first dev
// double-mount.
//
// ─── Allocation re-trigger (Codex F10 / F14) ────────────────────────────
// `fetchToken` lives in QuoteContext (provider state, survives this
// component's unmount). `retry()` bumps it so the effect re-runs even
// when `state.meta.quoteNo` is still `''` (React's `'' === ''` would
// otherwise skip the effect). Topbar's `+ 新報價` calls `newQuote()`,
// which both resets state AND bumps fetchToken in the same tick.
//
// ─── Date refresh (Codex F7 / F11 / F13 / F15) ──────────────────────────
// QuoteProvider lives at App-level, so `createBlankQuote()` runs at app
// boot and can capture yesterday's dates if the user enters Builder after
// midnight. Refresh dates ONLY on the very first Builder entry for this
// blank quote (`datesInitialised === false`). After that, all subsequent
// retries / remounts / refetches preserve whatever the user typed —
// including legitimately back-dated quotes that pre-date today.
// `newQuote()` flips the flag back to false so a fresh quote gets a
// fresh refresh cycle.

import { useEffect, useState, type JSX } from 'react';

import { ApiError } from '../../api/client';
import { nextQuoteNumber } from '../../api/quotes';
import { addDaysISO, todayISO } from '../../lib/dates';
import { useQuoteState } from '../../state/QuoteContext';
import styles from './BuilderPanel.module.scss';
import { ClientSection } from './sections/ClientSection';
import { MetaSection } from './sections/MetaSection';
import { SalesSection } from './sections/SalesSection';
import { Topbar } from './Topbar';

export function BuilderPanel(): JSX.Element {
  const { state, setQuoteNo, setMeta, fetchToken, retry, datesInitialised, markDatesInitialised } =
    useQuoteState();
  const [apiError, setApiError] = useState<string | null>(null);

  // ─── Effect 1: one-shot date init ──────────────────────────────────────
  // Runs at most once per provider lifecycle (until newQuote() resets
  // the flag). Kept separate from the allocation effect so flipping
  // datesInitialised doesn't cause a re-fetch loop.
  useEffect(() => {
    if (datesInitialised) return;
    if (state.meta.quoteNo !== '') {
      // Loaded / in-edit quote: skip date init too, just mark.
      markDatesInitialised();
      return;
    }
    const today = todayISO();
    const stale = state.meta.issueDate === '' || state.meta.issueDate < today;
    if (stale) {
      // Refresh BOTH dates from today (legacy / newQuote rule:
      // validUntil = issueDate + 15). Without coupling them, an overnight
      // mount would leave yesterday+15 as validUntil while issueDate jumps
      // to today — silently shortening the quote validity window.
      // Reviewer (Codex final F1 P2).
      setMeta('issueDate', today);
      setMeta('validUntil', addDaysISO(15));
    } else if (state.meta.validUntil === '' || state.meta.validUntil < today) {
      // issueDate is fine; only validUntil is stale → realign to today+15.
      setMeta('validUntil', addDaysISO(15));
    }
    markDatesInitialised();
    // Reads state.meta.issueDate/validUntil but doesn't react to their
    // changes (the markDatesInitialised flip below guards re-entry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesInitialised, state.meta.quoteNo, setMeta, markDatesInitialised]);

  // ─── Effect 2: quote-number allocation ────────────────────────────────
  useEffect(() => {
    if (state.meta.quoteNo !== '') return;
    const ctl = new AbortController();

    nextQuoteNumber(ctl.signal)
      .then((no) => {
        setQuoteNo(no);
        setApiError(null);
      })
      .catch((err: unknown) => {
        // AbortError on StrictMode unmount/remount → silent (expected)
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg =
          err instanceof ApiError
            ? `後端錯誤 (${err.status})：${err.message}`
            : err instanceof Error
              ? `後端無法連線：${err.message}`
              : '後端無法連線（未知錯誤）';
        setApiError(msg);
      });

    return () => ctl.abort();
  }, [state.meta.quoteNo, setQuoteNo, fetchToken]);

  function handleRetry(): void {
    setApiError(null);
    retry();
  }

  return (
    <aside className={styles.panel}>
      <Topbar />
      {apiError !== null && (
        <div role="alert" className={styles.apiError} data-testid="api-error">
          <div>{apiError}</div>
          <div className={styles.apiErrorHint}>
            {import.meta.env.DEV ? (
              <>
                請確認後端已啟動（本機：<code>cd backend && docker compose up</code>），
                然後點下方「重試」。
              </>
            ) : (
              <>請確認網路連線正常或後端服務已啟動，然後點下方「重試」。</>
            )}
          </div>
          <button
            type="button"
            className={styles.apiErrorRetry}
            onClick={handleRetry}
            data-testid="api-retry"
          >
            重試
          </button>
        </div>
      )}
      <div className={styles.body}>
        <MetaSection />
        <ClientSection />
        <SalesSection />
      </div>
    </aside>
  );
}
