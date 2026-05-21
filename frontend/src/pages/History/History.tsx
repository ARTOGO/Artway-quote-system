// History page — list saved quotes with filters + pagination; reopen / delete.
//
// 1:1 dark port of the legacy History page (legacy.html renderHistory /
// .hp-* markup): ARTWAY logo + 「所有業務共享的報價單列表」 subtitle, chip
// date-range filter (過去 7 天 / 1 個月 / 1 季 / 1 年 / 全部), 業務 / 狀態
// dropdowns, numbered pagination, gold-on-dark table with status pills, and a
// styled delete-confirm modal + toast (legacy .hp-confirm / .hp-toast) instead
// of the browser window.confirm/alert.
//
// Runs over the real backend (listQuotes / distinctSales / deleteQuote). Rows
// deep-link to #/quote/{quote_no} so the Builder reopens that quote (preserving
// 業務 bookmarks); the QuoteLoader route resolves the number via
// getQuoteByNumber.

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';

import {
  deleteQuote,
  distinctSales,
  listQuotes,
  type QuoteListItem,
  type QuoteListResult,
} from '../../api/quotes';
import { addDaysISO } from '../../lib/dates';
import { formatMoney } from '../../lib/quoteCalc';
import { navigate } from '../../lib/useHashRoute';
import { useQuoteState } from '../../state/QuoteContext';
import { STATUS_OPTIONS } from '../../state/quoteTypes';
import styles from './History.module.scss';

const PAGE_SIZE = 20;

// Legacy date-range chips (data-range = days; '' = 全部). 全部 is the default.
const RANGE_OPTIONS: ReadonlyArray<{ days: string; label: string }> = [
  { days: '7', label: '過去 7 天' },
  { days: '30', label: '過去 1 個月' },
  { days: '90', label: '過去 1 季' },
  { days: '365', label: '過去 1 年' },
  { days: '', label: '全部' },
];

function statusLabel(v: string): string {
  return (STATUS_OPTIONS.find((o) => o.value === v) ?? STATUS_OPTIONS[0]).label;
}

// "YYYY-MM-DD HH:mm" in Asia/Taipei from an ISO timestamp. The backend stores
// updated_at as UTC; format explicitly in the company timezone so the displayed
// time is consistent regardless of the viewer's browser timezone (Gemini review
// + project timezone rule), not the browser-local time legacy used.
function fmtUpdated(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei',
  })
    .format(d)
    .replace(/\//g, '-');
}

// Numbered-pagination model (legacy renderPagination): the current page ±2,
// with leading/trailing 1 / N and ellipses. 'gapL' / 'gapR' render as「…」.
function pageItems(cur: number, total: number): Array<number | 'gapL' | 'gapR'> {
  const items: Array<number | 'gapL' | 'gapR'> = [];
  const start = Math.max(1, cur - 2);
  const end = Math.min(total, cur + 2);
  if (start > 1) {
    items.push(1);
    if (start > 2) items.push('gapL');
  }
  for (let i = start; i <= end; i++) items.push(i);
  if (end < total) {
    if (end < total - 1) items.push('gapR');
    items.push(total);
  }
  return items;
}

interface Filters {
  salesName: string;
  status: string;
  rangeDays: string; // '' = 全部
}

const EMPTY_FILTERS: Filters = { salesName: '', status: '', rangeDays: '' };

interface Toast {
  msg: string;
  error: boolean;
}

export function History(): JSX.Element {
  const { state, newQuote } = useQuoteState();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [data, setData] = useState<QuoteListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesOptions, setSalesOptions] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<QuoteListItem | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((msg: string, isError = false): void => {
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    setToast({ msg, error: isError });
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      toastTimer.current = null;
    }, 2400); // legacy hp-toast duration
  }, []);

  // Cancel the toast timer on unmount (no setState after unmount).
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    },
    [],
  );

  // ＋ 新報價: clear the loaded quote BEFORE navigating, or (since QuoteProvider
  // sits above the router) the Builder would reopen the previously-loaded quote
  // and the next save could overwrite that row. Confirm first — same as the
  // Topbar 新報價 flow — so a preserved draft isn't silently discarded.
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

  // Re-fetch the list whenever the filters or page change. A date-range chip
  // maps to a dateFrom = today − N days (issue_date lower bound); 全部 clears it.
  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    const dateFrom = filters.rangeDays ? addDaysISO(-Number(filters.rangeDays)) : undefined;
    listQuotes(
      {
        salesName: filters.salesName || undefined,
        status: filters.status || undefined,
        dateFrom,
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

  const confirmDelete = async (): Promise<void> => {
    const item = pendingDelete;
    if (!item) return;
    setPendingDelete(null);
    try {
      await deleteQuote(item.id);
      // If the deleted row is the quote currently held in the shared Builder
      // state, clear it — otherwise 回 Builder would reopen a soft-deleted quote
      // and the next save would PUT /quotes/{deletedId} → 404.
      if (state.id === item.id) newQuote();
      showToast(`已刪除 ${item.quote_no}`);
      // Re-fetch from the server so pagination stays consistent. If we just
      // removed the last row on a page past the first, step back a page (which
      // re-fetches via the effect); otherwise force a re-fetch of this page.
      if (data && data.items.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        setReloadNonce((n) => n + 1);
      }
    } catch (e) {
      showToast('刪除失敗：' + (e instanceof Error ? e.message : '未知錯誤'), true);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className={styles.screen}>
      <main className={styles.page}>
        <header className={styles.head}>
          <img src="/logo/ARTWAY_logo_白_直.png" alt="ARTWAY" className={styles.logo} />
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>歷史紀錄</h1>
            <div className={styles.sub}>所有業務共享的報價單列表</div>
          </div>
          <nav className={styles.nav}>
            {/* Non-destructive return: plain #/ keeps the preserved Builder draft
                (QuoteProvider is above the router). */}
            <a href="#/" className={styles.btnGhost}>
              回 Builder
            </a>
            <button type="button" className={styles.btnPrimary} onClick={startNewQuote}>
              ＋ 新報價
            </button>
          </nav>
        </header>

        <div className={styles.filters}>
          <div className={`${styles.field} ${styles.dateField}`}>
            <span>日期區間</span>
            <div className={styles.rangeGroup} role="group" aria-label="日期區間">
              {RANGE_OPTIONS.map((r) => (
                <button
                  key={r.days || 'all'}
                  type="button"
                  className={styles.rangeBtn}
                  aria-pressed={filters.rangeDays === r.days}
                  onClick={() => patchFilter({ rangeDays: r.days })}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
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
          <div className={styles.filterActions}>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={() => patchFilter(EMPTY_FILTERS)}
            >
              重設
            </button>
          </div>
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
                  {data.items.map((it) => (
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
                          onClick={() => setPendingDelete(it)}
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ‹ 上頁
                </button>
                {pageItems(page, totalPages).map((it) =>
                  it === 'gapL' || it === 'gapR' ? (
                    <span key={it} className={styles.ellipsis}>
                      …
                    </span>
                  ) : (
                    <button
                      key={it}
                      type="button"
                      className={styles.pageBtn}
                      aria-current={it === page ? 'page' : undefined}
                      onClick={() => setPage(it)}
                    >
                      {it}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下頁 ›
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {pendingDelete && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="確認刪除"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPendingDelete(null);
          }}
        >
          <div className={styles.confirmBox}>
            <div className={styles.confirmTitle}>確認刪除</div>
            <div className={styles.confirmMsg}>
              確定要刪除報價單 <strong>{pendingDelete.quote_no}</strong> 嗎？
              <br />
              <span>（軟刪除：列表上看不到，但資料保留）</span>
            </div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button type="button" className={styles.confirmOk} onClick={confirmDelete}>
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`${styles.toast} ${toast.error ? styles.toastError : ''}`}
          role="status"
          aria-live="polite"
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
