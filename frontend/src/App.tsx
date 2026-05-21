// Top-level app router.
//
// QuoteProvider lives HERE — above the route switch — so navigating
// Builder ⇄ History ⇄ quote-detail doesn't unmount the reducer and drop the
// user's typed fields (Codex round 2 F6). The quote-detail route reuses the
// same provider: QuoteLoader fetches the quote by its 報價單號 and dispatches
// LOAD into this shared state, then renders the Builder.

import { useEffect, useState, type JSX } from 'react';

import styles from './App.module.scss';
import { getQuoteByNumber } from './api/quotes';
import { navigate, useHashRoute, type Route } from './lib/useHashRoute';
import { Builder } from './pages/Builder/Builder';
import { History } from './pages/History/History';
import { QuoteProvider, useQuoteState } from './state/QuoteContext';

export default function App(): JSX.Element {
  const route = useHashRoute();
  return (
    <QuoteProvider>
      <RouteSwitch route={route} />
    </QuoteProvider>
  );
}

function RouteSwitch({ route }: { route: Route }): JSX.Element {
  switch (route.name) {
    case 'history':
      return <History />;
    case 'quote-detail':
      return <QuoteLoader quoteNo={route.quoteNo} />;
    case 'builder':
      return <Builder />;
  }
}

// Resolve a #/quote/{quote_no} deep link (業務 bookmark) → load that quote into
// the Builder via the by-number endpoint. Shows loading / not-found states.
function QuoteLoader({ quoteNo }: { quoteNo: string }): JSX.Element {
  const { load, newQuote } = useQuoteState();
  const [phase, setPhase] = useState<'loading' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const ctl = new AbortController();
    setPhase('loading');
    getQuoteByNumber(quoteNo, ctl.signal)
      .then((q) => {
        // Bail if the user already left this route (e.g. Back to History) before
        // the request settled — a late success would otherwise yank them back to
        // Builder and load the quote they just left (Codex P2).
        if (ctl.signal.aborted) return;
        load(q);
        // Normalize the URL to the Builder route once loaded — staying on the
        // stale #/quote/{quote_no} deep link means a later 新報價 / edit happens
        // under the old address, and a refresh would reopen the old quote
        // instead of the active builder state (Codex PR review P2). Replace (not
        // push) the deep-link entry so Back returns to History, not back here
        // (which would reload + re-replace, trapping the user) (Codex P2).
        navigate('/', { replace: true });
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setErrMsg(e instanceof Error ? e.message : '載入失敗');
        setPhase('error');
      });
    return () => ctl.abort();
  }, [quoteNo, load]);

  return (
    <div className={styles.screen}>
      <main className={styles.page}>
        {phase === 'loading' ? (
          <p className={styles.subtitle}>載入報價單 {quoteNo}…</p>
        ) : (
          <>
            <h1>找不到報價單</h1>
            <p className={styles.subtitle}>
              <code className={styles.quoteNo}>{quoteNo}</code>：{errMsg}
            </p>
            <nav className={styles.nav}>
              <a href="#/history">回歷史紀錄</a>
              {' · '}
              <a
                href="#/"
                onClick={() => {
                  // Clear the failed-load remnant so Builder opens a true blank
                  // quote with a fresh number (not the stale failed one).
                  newQuote();
                }}
              >
                回 Builder（新報價）
              </a>
            </nav>
          </>
        )}
      </main>
    </div>
  );
}
