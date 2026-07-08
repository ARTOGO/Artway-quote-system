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
  createQuote,
  deleteQuote,
  distinctSales,
  getQuote,
  listQuotes,
  updateQuote,
  type QuoteListItem,
  type QuoteListResult,
} from '../../api/quotes';
import { addDaysISO, todayISO } from '../../lib/dates';
import { formatMoney } from '../../lib/quoteCalc';
import { navigate } from '../../lib/useHashRoute';
import { useQuoteState } from '../../state/QuoteContext';
import { STATUS_OPTIONS, type QuoteStatus } from '../../state/quoteTypes';
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
  const { state, newQuote, load } = useQuoteState();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [data, setData] = useState<QuoteListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [salesOptions, setSalesOptions] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<QuoteListItem | null>(null);
  // 複製成功後的確認 modal:顯示新單號 + 倒數,倒數結束(或立即前往)才跳去
  // Builder,業務也可以選擇停留在歷史頁繼續操作。
  const [copiedInfo, setCopiedInfo] = useState<{ quoteNo: string; countdown: number } | null>(
    null,
  );
  const [toast, setToast] = useState<Toast | null>(null);
  // 每列可能同時被其他非同步動作 (change status / duplicate / print) 佔用 —
  // 用單獨的 map 追蹤,避免同時按刪除又按複製之類的邊角情況造成 UI 不一致。
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
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

  // 複製成功 modal 的倒數計時器 — 每秒 -1;0 時自動跳到 Builder。
  useEffect(() => {
    if (!copiedInfo) return;
    if (copiedInfo.countdown <= 0) {
      // 倒數結束:清 modal + 跳走(state 已在 handleCopy 內 load 好)
      setCopiedInfo(null);
      navigate('/');
      return;
    }
    const t = window.setTimeout(() => {
      setCopiedInfo((c) => (c ? { ...c, countdown: c.countdown - 1 } : c));
    }, 1000);
    return () => window.clearTimeout(t);
  }, [copiedInfo]);

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

  // 直接輸出 PDF — 該筆已在雲端,不必再存,跳過 Builder 兩段式確認。走 hash
  // 路由帶 `?autoprint=1`,QuoteLoader 會在 quote 載入後自動觸發 window.print()
  // 並在 afterprint 事件送回歷史頁 (見 App.tsx)。
  const handlePrint = (item: QuoteListItem): void => {
    navigate(`/quote/${encodeURIComponent(item.quote_no)}?autoprint=1`);
  };

  // 複製 — 直接建立同內容新報價 (草稿 / 新單號 / 今日開立日),完成後跳進 Builder。
  // 走 create 是為了立刻拿到伺服器配發的 quote_no + id,業務進 Builder 就看得到
  // 新單號 + 歷史列表下次刷新也會有這筆。
  const handleCopy = async (item: QuoteListItem): Promise<void> => {
    if (rowBusy[item.id]) return;
    setRowBusy((b) => ({ ...b, [item.id]: true }));
    try {
      const src = await getQuote(item.id);
      const today = todayISO();
      const clone = {
        ...src,
        id: null as string | null,
        status: 'draft' as QuoteStatus,
        meta: {
          ...src.meta,
          quoteNo: '', // 伺服器在 create 時配發新單號
          issueDate: today,
          validUntil: addDaysISO(15),
        },
      };
      const res = await createQuote(clone);
      const persisted = {
        ...clone,
        id: res.id,
        meta: { ...clone.meta, quoteNo: res.quote_no },
      };
      load(persisted);
      // 不直接跳走 — 顯示成功 modal + 5 秒倒數,業務可選擇跳走或停留。
      setCopiedInfo({ quoteNo: res.quote_no, countdown: 5 });
    } catch (e) {
      showToast('複製失敗:' + (e instanceof Error ? e.message : '未知錯誤'), true);
    } finally {
      setRowBusy((b) => {
        const next = { ...b };
        delete next[item.id];
        return next;
      });
    }
  };

  // 直接在歷史頁改狀態 — 用完整 PUT (後端無 PATCH endpoint,存全部欄位)。
  // Optimistic UI:先更新畫面,失敗還原並顯示 toast。
  const handleStatusChange = async (
    item: QuoteListItem,
    nextStatus: QuoteStatus,
  ): Promise<void> => {
    if (nextStatus === item.status || rowBusy[item.id]) return;
    const prevStatus = item.status;
    setRowBusy((b) => ({ ...b, [item.id]: true }));
    // Optimistic
    setData((d) => {
      if (!d) return d;
      return {
        ...d,
        items: d.items.map((x) => (x.id === item.id ? { ...x, status: nextStatus } : x)),
      };
    });
    try {
      const full = await getQuote(item.id);
      await updateQuote(item.id, { ...full, status: nextStatus });
      showToast(`已更新狀態為 ${STATUS_OPTIONS.find((o) => o.value === nextStatus)?.label ?? ''}`);
    } catch (e) {
      // Revert on failure
      setData((d) => {
        if (!d) return d;
        return {
          ...d,
          items: d.items.map((x) => (x.id === item.id ? { ...x, status: prevStatus } : x)),
        };
      });
      showToast('狀態更新失敗:' + (e instanceof Error ? e.message : '未知錯誤'), true);
    } finally {
      setRowBusy((b) => {
        const next = { ...b };
        delete next[item.id];
        return next;
      });
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
                  {data.items.map((it) => {
                    const busy = !!rowBusy[it.id];
                    return (
                      <tr key={it.id} data-template={it.status === 'template' ? 'true' : undefined}>
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
                          <select
                            className={styles.statusSelect}
                            data-status={it.status}
                            value={it.status}
                            disabled={busy}
                            onChange={(e) =>
                              void handleStatusChange(it, e.target.value as QuoteStatus)
                            }
                            aria-label={`${it.quote_no} 狀態`}
                          >
                            {STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className={styles.updated}>{fmtUpdated(it.updated_at)}</td>
                        <td className={styles.actions}>
                          <a
                            className={styles.iconBtn}
                            href={`#/quote/${encodeURIComponent(it.quote_no)}`}
                            aria-disabled={busy}
                          >
                            載入
                          </a>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => void handleCopy(it)}
                            disabled={busy}
                            title="以此筆內容為底建立新報價"
                          >
                            複製
                          </button>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => handlePrint(it)}
                            disabled={busy}
                            title="輸出 PDF（不重存雲端）"
                          >
                            PDF
                          </button>
                          <button
                            type="button"
                            className={`${styles.iconBtn} ${styles.danger}`}
                            onClick={() => setPendingDelete(it)}
                            disabled={busy}
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

      {copiedInfo && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="已複製成功"
        >
          <div className={styles.confirmBox}>
            <div className={styles.copiedTitle}>已複製成功</div>
            <div className={styles.copiedNo}>{copiedInfo.quoteNo}</div>
            <div className={styles.copiedCountdown}>
              {copiedInfo.countdown} 秒後自動跳轉至編輯頁…
            </div>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.copiedStay}
                onClick={() => setCopiedInfo(null)}
              >
                停留在此頁
              </button>
              <button
                type="button"
                className={styles.copiedGo}
                onClick={() => {
                  setCopiedInfo(null);
                  navigate('/');
                }}
              >
                立即前往
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
