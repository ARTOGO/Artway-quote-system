// Top-level app router.
//
// QuoteProvider lives HERE — above the route switch — so navigating
// Builder ⇄ History ⇄ quote-detail doesn't unmount the reducer and drop the
// user's typed fields (Codex round 2 F6). The quote-detail route reuses the
// same provider: QuoteLoader fetches the quote by its 報價單號 and dispatches
// LOAD into this shared state, then renders the Builder.

import { useEffect, useRef, useState, type JSX } from 'react';

import styles from './App.module.scss';
import { getQuoteByNumber } from './api/quotes';
import { todayISO } from './lib/dates';
import { printWithCustomFilename } from './lib/print';
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
      return <QuoteLoader quoteNo={route.quoteNo} autoprint={route.autoprint ?? false} />;
    case 'builder':
      return <Builder />;
  }
}

// Resolve a #/quote/{quote_no} deep link (業務 bookmark) → load that quote into
// the Builder via the by-number endpoint. Shows loading / not-found states.
// When `autoprint=1`, we keep the route on quote-detail and render the Builder
// inline so window.print() prints the actual quote preview (not the loading
// placeholder). afterprint sends the user back to the history page.
function QuoteLoader({ quoteNo, autoprint }: { quoteNo: string; autoprint: boolean }): JSX.Element {
  const { load, newQuote } = useQuoteState();
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState('');
  // 只在載入完成的當下抓住 quote metadata(給列印檔名用) — 不能直接讀 state,
  // 因為 autoprint 分支不會 navigate 走,state 之後可能被使用者編輯。
  const printMetaRef = useRef<{ quoteNo: string; client: string; title: string } | null>(null);
  // Ensure autoprint only fires once per mount even if effects re-run.
  const firedPrintRef = useRef(false);

  useEffect(() => {
    const ctl = new AbortController();
    setPhase('loading');
    firedPrintRef.current = false;
    printMetaRef.current = null;
    getQuoteByNumber(quoteNo, ctl.signal)
      .then((q) => {
        // Bail if the user already left this route (e.g. Back to History) before
        // the request settled — a late success would otherwise yank them back to
        // Builder and load the quote they just left (Codex P2).
        if (ctl.signal.aborted) return;
        load(q);
        if (autoprint) {
          // Stash print-time metadata (react state may not have flushed to the
          // Builder DOM by the time we window.print, but state IS in the reducer).
          printMetaRef.current = {
            quoteNo: q.meta.quoteNo,
            client: q.client.company,
            title: q.meta.title,
          };
          setPhase('ready');
          return;
        }
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
  }, [quoteNo, autoprint, load]);

  // Autoprint: once Builder DOM is on screen, trigger the browser print dialog.
  // Wait one extra frame so any children with useLayoutEffect / lazy chunks
  // finish measuring — otherwise Chrome captures a half-rendered preview.
  useEffect(() => {
    if (phase !== 'ready' || !autoprint || firedPrintRef.current) return;
    if (!printMetaRef.current) return;
    firedPrintRef.current = true;
    const meta = printMetaRef.current;

    // 立刻把 ?autoprint=1 從網址拿掉 — 避免使用者取消印刷後重整/按上一頁
    // 又觸發一次列印,也讓 quote-detail 網址回到乾淨的 deep-link 樣貌。
    window.history.replaceState(
      null,
      '',
      `#/quote/${encodeURIComponent(meta.quoteNo)}`,
    );

    // 印完或取消之後(afterprint 或 5 秒 fallback 先到者)把使用者送回歷史頁。
    // 用 push (非 replace) 讓瀏覽器上一頁能回到剛才那筆報價的 Builder。
    // once flag 防止 afterprint + fallback 兩者同時觸發雙重 navigate。
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      window.removeEventListener('afterprint', finish);
      window.clearTimeout(fallbackId);
      navigate('/history');
    };
    window.addEventListener('afterprint', finish);
    const fallbackId = window.setTimeout(finish, 5000);

    const raf = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        printWithCustomFilename({
          quoteNo: meta.quoteNo,
          dateISO: todayISO(),
          clientCompany: meta.client,
          projectTitle: meta.title,
        });
      }, 250); // 給 Preview 內部 img/svg 一點時間解析完畢
    });

    // Unmount 時把所有掛在 window 上的東西清乾淨 — 否則使用者按 Topbar 的
    // 「歷史紀錄」離開這條 route 之後,5 秒 timer 仍會 navigate 一次,把畫面
    // 又拉回歷史頁,看起來就像按鈕行為異常。
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('afterprint', finish);
      window.clearTimeout(fallbackId);
    };
  }, [phase, autoprint]);

  // Ready + autoprint → render the real Builder so window.print() captures its
  // preview. Ready + !autoprint 只有這個瞬間會走到(通常已 navigate 走);保險起見
  // 一樣 render Builder。
  if (phase === 'ready') {
    return <Builder />;
  }

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
