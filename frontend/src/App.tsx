// Top-level app router. PR 3 M4 only renders placeholders; PR 4 will
// replace each branch with the real Builder / History / Quote-detail
// React tree. Reviewer (Codex #3257453839) flagged inline styles violating
// CLAUDE.md design-token rule — now uses ./App.module.scss with $space-*
// tokens.

import type { JSX } from 'react';

import styles from './App.module.scss';
import { useHashRoute } from './lib/useHashRoute';

export default function App(): JSX.Element {
  const route = useHashRoute();

  switch (route.name) {
    case 'history':
      return <HistoryPlaceholder />;
    case 'quote-detail':
      return <QuoteDetailPlaceholder quoteNo={route.quoteNo} />;
    case 'builder':
      return <BuilderPlaceholder />;
  }
}

function BuilderPlaceholder(): JSX.Element {
  return (
    <main className={styles.page}>
      <h1>ARTWAY 報價單系統</h1>
      <p className={styles.subtitle}>
        PR 3 scaffold — Builder（左：填表 / 右：A4 預覽）將在 PR 4 1:1 復刻。
      </p>
      <nav className={styles.nav}>
        <a href="#/history">查看歷史紀錄</a>
      </nav>
    </main>
  );
}

function HistoryPlaceholder(): JSX.Element {
  return (
    <main className={styles.page}>
      <h1>歷史紀錄</h1>
      <p className={styles.subtitle}>PR 3 scaffold — 列表 / 篩選 / 分頁將在 PR 4 復刻。</p>
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
      <p className={styles.subtitle}>PR 4 將載入該筆資料進 Builder 編輯。</p>
      <nav className={styles.nav}>
        <a href="#/history">回歷史紀錄</a>
        {' · '}
        <a href="#/">回 Builder</a>
      </nav>
    </main>
  );
}
