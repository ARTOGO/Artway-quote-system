// BuilderPanel — left-side scrollable form panel (Topbar + sections).
//
// ─── Quote number ────────────────────────────────────────────────────────
// The AW-... serial is allocated by the backend at SAVE time (POST /quotes
// assigns it atomically, race-free) — NOT on Builder mount. So refreshing or
// previewing an unsaved quote never burns a serial. A brand-new quote shows no
// number until 存到雲端; the create response stamps the assigned number into
// state (see useSaveQuote / SET_SAVED).
//
// ─── Date refresh (Codex F7 / F11 / F13 / F15) ──────────────────────────
// QuoteProvider lives at App-level, so `createBlankQuote()` runs at app boot
// and can capture yesterday's dates if the user enters Builder after midnight.
// Refresh dates ONLY on the first Builder entry for this blank quote
// (`datesInitialised === false`); afterwards preserve whatever the user typed
// (incl. legitimately back-dated quotes). `newQuote()` resets the flag.

import { useEffect, type JSX } from 'react';

import { addDaysISO, todayISO } from '../../lib/dates';
import { useQuoteState } from '../../state/QuoteContext';
import styles from './BuilderPanel.module.scss';
import { ClientSection } from './sections/ClientSection';
import { DeliverablesSection } from './sections/DeliverablesSection';
import { GroupsSection } from './sections/GroupsSection';
import { MetaSection } from './sections/MetaSection';
import { NotesSection } from './sections/NotesSection';
import { PaymentSection } from './sections/PaymentSection';
import { SalesSection } from './sections/SalesSection';
import { ServicesSection } from './sections/ServicesSection';
import { Topbar } from './Topbar';

export function BuilderPanel(): JSX.Element {
  const { state, setMeta, datesInitialised, markDatesInitialised } = useQuoteState();

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

  return (
    <aside className={styles.panel}>
      <Topbar />
      <div className={styles.body}>
        <MetaSection />
        <ClientSection />
        <SalesSection />
        <GroupsSection />
        <DeliverablesSection />
        <ServicesSection />
        <NotesSection />
        <PaymentSection />
      </div>
    </aside>
  );
}
