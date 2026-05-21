// History page — list saved quotes with filters + pagination; reopen / delete.
//
// Mirrors legacy renderHistory (legacy.html:3459) over the real backend
// (listQuotes / distinctSales / deleteQuote). Rows deep-link to
// #/quote/{quote_no} so the Builder reopens that quote (preserving 業務
// bookmarks); the QuoteLoader route resolves the number via getQuoteByNumber.

import { useCallback, useEffect, useState, type JSX } from 'react';

import {
  deleteQuote,
  distinctSales,
  listQuotes,
  type QuoteListItem,
  type QuoteListResult,
} from '../../api/quotes';
import { formatMoney } from '../../lib/quoteCalc';
import { navigate } from '../../lib/useHashRoute';
import { useQuoteState } from '../../state/QuoteContext';
import { STATUS_OPTIONS } from '../../state/quoteTypes';
import styles from './History.module.scss';

const PAGE_SIZE = 20;

function statusLabel(v: string): string {
  return (STATUS_OPTIONS.find((o) => o.value === v) ?? STATUS_OPTIONS[0]).label;
}

// "YYYY-MM-DD HH:mm" from an ISO timestamp (legacy updatedStr, line 3473).
function fmtUpdated(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface Filters {
  salesName: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = { salesName: '', status: '', dateFrom: '', dateTo: '' };

export function History(): JSX.Element {
  const { state, newQuote } = useQuoteState();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [data, setData] = useState<QuoteListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesOptions, setSalesOptions] = useState<string[]>([]);

  // ＋ 新報價: clear the loaded quote BEFORE navigating, or (since QuoteProvider
  // sits above the router) the Builder would reopen the previously-loaded quote
  // and the next save could overwrite that row (Codex P1). Confirm first — same
  // as the Topbar 新報價 flow — so a preserved draft isn't silently discarded
  // (Codex P2). newQuote() also bumps the fetch token so the Builder pulls a
  // fresh quote number.
  const startNewQuote = (): void => {
    if (!window.confirm('確定建立新報價？目前未儲存的資料會遺失。')) return;
    newQuote();
    navigate('/');
  };

  // Sales-name filter options (fetched once).
  useEffect(() => {
    let alive = true;
    distinctSales()
      .then((names) => {
        if (alive) setSalesOptions(names);
      })
      .catch(() => {
        /* non-fatal — the dropdown just stays at 全部 */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Re-fetch the list whenever the filters or page change.
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    listQuotes(
      {
        salesName: filters.salesName || undefined,
        status: filters.status || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        page,
        pageSize: PAGE_SIZE,
      },
      ctl.signal,
    )
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setError(e instanceof Error ? e.message : '載入失敗');
        setLoading(false);
      });
    return () => ctl.abort();
  }, [filters, page, reloadNonce]);

  const patchFilter = useCallback((patch: Partial<Filters>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  const onDelete = async (item: QuoteListItem): Promise<void> => {
    if (!window.confirm(`確定刪除報價單 ${item.quote_no}？此動作無法復原。`)) return;
    try {
      await deleteQuote(item.id);
      // If the deleted row is the quote currently held in the shared Builder
      // state, clear it — otherwise ← 回報價單 would reopen a soft-deleted quote
      // and the next save would PUT /quotes/{deletedId} → 404 (Codex P2).
      if (state.id === item.id) newQuote();
      // Re-fetch from the server so pagination stays consistent (a local filter
      // would leave a short page / a "第 2 / 1 頁" summary — Codex P2). If we just
      // removed the last row on a page past the first, step back a page (which
      // re-fetches via the effect); otherwise force a re-fetch of this page.
      if (data && data.items.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        setReloadNonce((n) => n + 1);
      }
    } catch (e) {
      window.alert('刪除失敗：' + (e instanceof Error ? e.message : '未知錯誤'));
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className={styles.screen}>
      <main className={styles.page}>
        <header className={styles.head}>
          <h1>歷史紀錄</h1>
          <nav className={styles.nav}>
            {/* Non-destructive return: plain #/ keeps the preserved Builder draft
                (QuoteProvider is above the router) — Codex P2. */}
            <a href="#/">← 回報價單</a>
            <button type="button" className={styles.newBtn} onClick={startNewQuote}>
              ＋ 新報價
            </button>
          </nav>
        </header>

        <div className={styles.filters}>
          <label className={styles.field}>
            <span>業務</span>
            <select
              value={filters.salesName}
              onChange={(e) => patchFilter({ salesName: e.target.value })}
              aria-label="業務篩選"
            >
              <option value="">全部</option>
              {salesOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>狀態</span>
            <select
              value={filters.status}
              onChange={(e) => patchFilter({ status: e.target.value })}
              aria-label="狀態篩選"
            >
              <option value="">全部</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>開立日（起）</span>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => patchFilter({ dateFrom: e.target.value })}
              aria-label="開立日起"
            />
          </label>
          <label className={styles.field}>
            <span>開立日（迄）</span>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => patchFilter({ dateTo: e.target.value })}
              aria-label="開立日迄"
            />
          </label>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => patchFilter(EMPTY_FILTERS)}
          >
            清除篩選
          </button>
        </div>

        <div className={styles.summary} data-testid="history-summary">
          {data && data.total > 0 ? `共 ${data.total} 筆 · 第 ${data.page} / ${totalPages} 頁` : ''}
        </div>

        {loading ? (
          <div className={styles.state}>載入中…</div>
        ) : error ? (
          <div className={`${styles.state} ${styles.error}`}>載入失敗：{error}</div>
        ) : !data || data.items.length === 0 ? (
          <div className={styles.empty}>
            沒有符合條件的報價單
            <br />
            <span>調整篩選條件或建立新報價</span>
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>單號</th>
                    <th>開立日期</th>
                    <th>業務</th>
                    <th>客戶</th>
                    <th>專案名稱</th>
                    <th className={styles.right}>金額</th>
                    <th>狀態</th>
                    <th>最後更新</th>
                    <th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => {
                    return (
                      <tr key={it.id}>
                        <td>
                          <a
                            className={styles.quoteNo}
                            href={`#/quote/${encodeURIComponent(it.quote_no)}`}
                          >
                            {it.quote_no}
                          </a>
                        </td>
                        <td>{it.issue_date || '—'}</td>
                        <td>{it.sales_name || '—'}</td>
                        <td>{it.client_company || '—'}</td>
                        <td>{it.title || <span className={styles.untitled}>（未命名）</span>}</td>
                        <td className={styles.right}>NT$ {formatMoney(it.total_amount)}</td>
                        <td>
                          <span className={styles.pill} data-status={it.status}>
                            {statusLabel(it.status)}
                          </span>
                        </td>
                        <td className={styles.updated}>{fmtUpdated(it.updated_at)}</td>
                        <td className={styles.actions}>
                          <a
                            className={styles.iconBtn}
                            href={`#/quote/${encodeURIComponent(it.quote_no)}`}
                          >
                            載入
                          </a>
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.danger}`}
                            onClick={() => onDelete(it)}
                          >
                            刪除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← 上一頁
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一頁 →
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
