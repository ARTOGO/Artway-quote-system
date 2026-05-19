// Top-level app router.
//
// Session 1 (this PR) wires the real <Builder /> tree for the root route.
// History + quote-detail remain placeholders that will be replaced in
// Sessions 4 + 5 (History page, quote-detail load-into-Builder).
//
// Reviewer (Codex round 2 F6): QuoteProvider lives HERE — above the route
// switch — so navigating Builder → History → back to Builder no longer
// unmounts the reducer and silently drops the user's typed fields.
// Session 4's history-load-into-Builder also benefits: History page can
// call `load(quote)` from the same provider context.

import type { JSX } from 'react';

import styles from './App.module.scss';
import { useHashRoute, type Route } from './lib/useHashRoute';
import { Builder } from './pages/Builder/Builder';
import { QuoteProvider } from './state/QuoteContext';

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
      return <HistoryPlaceholder />;
    case 'quote-detail':
      return <QuoteDetailPlaceholder quoteNo={route.quoteNo} />;
    case 'builder':
      return <Builder />;
  }
}

function HistoryPlaceholder(): JSX.Element {
  return (
    <main className={styles.page}>
      <h1>歷史紀錄</h1>
      <p className={styles.subtitle}>Session 4 將復刻：列表 / 篩選 / 載入 / 刪除。</p>
      <nav className={styles.nav}>
        <a href="#/">回到 Builder</a>
      </nav>
    </main>
  );
}

function QuoteDetailPlaceholder({ quoteNo }: { quoteNo: string }): JSX.Element {
  return (
    <main className={styles.page}>
      <h1>報價單詳情</h1>
      <p className={styles.subtitle}>
        Quote No: <code className={styles.quoteNo}>{quoteNo}</code>
      </p>
      <p className={styles.subtitle}>Session 4-5 將載入該筆資料進 Builder 編輯。</p>
      <nav className={styles.nav}>
        <a href="#/history">回歷史紀錄</a>
        {' · '}
        <a href="#/">回 Builder</a>
      </nav>
    </main>
  );
}
