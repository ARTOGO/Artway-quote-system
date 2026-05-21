// Topbar — sticky header inside the Builder panel.
//
// Legacy: `.bp-toolbar` block (legacy.html line 1726-1748). For Session 1 we
// keep a native <select> for status; Session 4 swaps it for a Radix
// DropdownMenu so we can render the coloured status dot inline.
//
// Reviewer notes:
//   - F3 [P2] `+ 新報價` button is wired to `reset()` (resets state →
//     state.meta.quoteNo='' → BuilderPanel useEffect re-fetches a fresh
//     atomic serial from the backend). Session 4 swaps window.confirm for
//     a Radix AlertDialog.
//   - F4 [P3] status dot dropped inline-style hex and now uses a
//     `data-status` attribute that the SCSS module styles via tokens.
//   - F9 [P2] quote-number allocation moved to the backend
//     `POST /api/quotes/next-number` (atomic Postgres ON CONFLICT) so two
//     staff can no longer mint the same AW-...-001 from their browsers.

import type { JSX } from 'react';

import { useQuoteState } from '../../state/QuoteContext';
import { STATUS_OPTIONS, type QuoteStatus } from '../../state/quoteTypes';
import styles from './Topbar.module.scss';

export function Topbar(): JSX.Element {
  const { state, setStatus, newQuote } = useQuoteState();

  function handleNewQuote(): void {
    // Legacy parity (legacy.html line 3838-3854): confirm before clearing.
    // Session 4 swaps this for a Radix AlertDialog with proper UX.
    if (!window.confirm('確定建立新報價？目前未儲存的資料會遺失。')) return;
    // newQuote() = reset state to a blank quote and re-arm the one-shot date
    // refresh. The quote number stays '' until the next save (the backend
    // allocates it at save time — Option B), so there's nothing to fetch here.
    newQuote();
  }

  return (
    <div className={styles.toolbar}>
      <div className={styles.head}>
        <img src="/logo/ARTWAY_logo_白_直.png" alt="ARTWAY" className={styles.logo} />
        <div className={styles.titleBlock}>
          <h1>報價單 Builder</h1>
          <div className={styles.sub}>填表 → 自動帶入右側預覽 → 列印</div>
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnGhost}
          title="清空目前內容，建立新報價"
          onClick={handleNewQuote}
        >
          + 新報價
        </button>
        <a href="#/history" className={styles.btnGhost} title="開啟歷史紀錄">
          歷史紀錄
        </a>
        <label className={styles.statusWrap} title="報價單狀態">
          <span className={styles.statusDot} data-status={state.status} data-testid="status-dot" />
          <select
            className={styles.statusSelect}
            value={state.status}
            onChange={(e) => setStatus(e.target.value as QuoteStatus)}
            aria-label="報價單狀態"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
