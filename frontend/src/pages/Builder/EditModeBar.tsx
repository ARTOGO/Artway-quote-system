// 編輯預覽 (edit mode) — Session 4.
//
// Toggles the A4 preview into a directly-editable surface for last-minute
// text tweaks before printing. Mirrors legacy `setEditMode` / `makeEditable`
// (legacy.html line 4124-4205): leaf text nodes inside each `[data-page]`
// become contenteditable; interactive / [data-no-edit] elements are skipped.
//
// Edits are DOM-only (NOT written back to quote state) — same as legacy,
// where edit mode is a print-time visual override. A re-render (e.g. editing
// a builder field) reconciles the DOM and discards uncommitted preview edits;
// the MutationObserver re-applies contenteditable so the toggle stays live.
//
// The action bar also hosts 輸出 PDF (print → Save as PDF, via
// printWithCustomFilename). 儲存 (cloud save) lands with the report-API wiring
// (PR5); once it does, print becomes the legacy two-stage 存到雲端→輸出 PDF flow.

import { useEffect, useRef, useState, type JSX } from 'react';

import { todayISO } from '../../lib/dates';
import { printWithCustomFilename } from '../../lib/print';
import { useSaveQuote } from '../../lib/useSaveQuote';
import { useQuoteState } from '../../state/QuoteContext';
import styles from './EditModeBar.module.scss';

// Exact legacy labels (legacy.html saveToCloud, line 3748-3765): the cloud-save
// action reads 存到雲端, not 儲存.
const SAVE_LABEL: Record<string, string> = {
  idle: '存到雲端',
  saving: '儲存中…',
  saved: '已存到雲端',
  error: '儲存失敗',
};

// Inline tags that don't disqualify an element from being a "leaf" — a node
// whose only children are these is still directly editable as one unit.
const INLINE = new Set([
  'EM',
  'STRONG',
  'SPAN',
  'B',
  'I',
  'U',
  'SUP',
  'SUB',
  'BR',
  'A',
  'CODE',
  'SMALL',
  'MARK',
]);

// Elements that must never become contenteditable (interactive controls,
// media, or explicitly opted-out nodes).
const SKIP_SELECTOR = 'button,input,textarea,select,img,svg,[data-no-edit]';

function isLeaf(el: Element): boolean {
  if (!el.textContent || !el.textContent.trim()) return false;
  if (el.children.length === 0) return true;
  return Array.from(el.children).every((c) => INLINE.has(c.tagName));
}

function makeEditable(node: Element): void {
  if (node.matches(SKIP_SELECTOR)) return;
  if (isLeaf(node)) {
    node.setAttribute('contenteditable', 'true');
    return;
  }
  Array.from(node.children).forEach((c) => makeEditable(c));
}

function removeEditable(scope: ParentNode): void {
  scope.querySelectorAll('[contenteditable="true"]').forEach((el) => {
    el.removeAttribute('contenteditable');
  });
}

export function EditModeBar(): JSX.Element {
  const { state, dispatch } = useQuoteState();
  const { save, status: saveStatus, reset: resetSave } = useSaveQuote();
  const [editMode, setEditMode] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  // A create issued during the two-stage print returns an id we stamp only AFTER
  // the print modal closes — so the SET_SAVED re-render (which discards DOM-only
  // edit-mode tweaks) happens after the PDF is captured, not before (Codex P2).
  // Stamped on close whether the user printed or cancelled, so the created row
  // is never left orphaned (next save would otherwise create a duplicate).
  const pendingStamp = useRef<{ id: string; forQuoteNo: string } | null>(null);
  // The standalone 已存到雲端 flash auto-resets after 1.8s; track its timer so a
  // new save started within that window cancels the stale reset (which would
  // otherwise clear the later save's status / re-enable buttons mid-flight or
  // hide its error — Codex P2).
  const flashTimer = useRef<number | null>(null);
  const clearFlash = (): void => {
    if (flashTimer.current !== null) {
      window.clearTimeout(flashTimer.current);
      flashTimer.current = null;
    }
  };
  // 輸出 PDF is a two-stage 存到雲端 → 輸出 PDF flow (legacy showPrintConfirm,
  // line 3105) so every exported PDF is persisted/reopenable from History.
  const [printOpen, setPrintOpen] = useState(false);
  const [printStep, setPrintStep] = useState<'save' | 'print'>('save');

  // quote_no is the backend-allocated permanent ID; until it lands (next-number
  // pending / failed) the preview prints "—" and the backend rejects a save
  // (quote_no required). Gate both 儲存 and 輸出 PDF on it.
  const hasQuoteNo = state.meta.quoteNo.trim() !== '';

  const doPrint = (): void => {
    printWithCustomFilename({
      quoteNo: state.meta.quoteNo,
      dateISO: todayISO(),
      clientCompany: state.client.company,
      projectTitle: state.meta.title,
    });
  };

  // Standalone 存到雲端 (cloud save). Flash 已存到雲端 then settle back.
  const handleSave = async (): Promise<void> => {
    clearFlash(); // cancel any pending flash-reset from a prior save
    try {
      await save();
      flashTimer.current = window.setTimeout(() => {
        flashTimer.current = null;
        resetSave();
      }, 1800); // legacy reset delay (line 3760)
    } catch {
      /* saveStatus is 'error'; the button surfaces the failure */
    }
  };

  // 輸出 PDF — open the two-stage confirm; step 1 saves, step 2 prints.
  const openPrint = (): void => {
    clearFlash(); // a stale flash-reset must not fire during the print save
    setPrintStep('save');
    resetSave();
    setPrintOpen(true);
  };
  const handlePrintAction = async (): Promise<void> => {
    if (printStep === 'save') {
      try {
        const forQuoteNo = state.meta.quoteNo;
        // Defer the id stamp (no re-render yet) so edit-mode DOM tweaks survive
        // to the print; stamped on close. For an already-saved quote this is a
        // no-op stamp anyway (Codex P2).
        const res = await save({ stamp: false });
        pendingStamp.current = { id: res.id, forQuoteNo };
        setPrintStep('print');
      } catch {
        /* saveStatus is 'error'; the modal button shows 儲存失敗，重試 */
      }
    } else {
      setPrintOpen(false); // queued; the print below runs first (edits intact)
      doPrint();
    }
  };

  // On print-modal close (printed OR cancelled): stamp the deferred id so the
  // created row isn't orphaned, then reset the 存到雲端 button label — the
  // two-stage path otherwise leaves it stuck on 已存到雲端 (Codex P2 + P3).
  useEffect(() => {
    if (printOpen) return;
    if (pendingStamp.current) {
      dispatch({
        type: 'SET_SAVED',
        id: pendingStamp.current.id,
        forQuoteNo: pendingStamp.current.forQuoteNo,
      });
      pendingStamp.current = null;
    }
    resetSave();
  }, [printOpen, resetSave, dispatch]);

  // Cancel a pending flash-reset timer on unmount (no setState after unmount).
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  // Apply / strip contenteditable whenever edit mode flips, and keep it
  // applied across preview re-renders via a MutationObserver (legacy obs).
  useEffect(() => {
    const root = document.querySelector('[data-preview-root]');
    if (!root) return;

    const apply = (): void => {
      if (editMode) {
        root.querySelectorAll('[data-page]').forEach((page) => {
          Array.from(page.children).forEach((c) => makeEditable(c));
        });
      } else {
        removeEditable(root);
      }
    };
    apply();

    if (!editMode) return;
    const obs = new MutationObserver(() => apply());
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [editMode]);

  // Escape closes the modal, or exits edit mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // Don't let Escape close the print modal mid-save — the other close paths
      // (返回 / overlay) are disabled while saving, and closing here would run
      // the stamp effect before the create resolves, stranding the new row's id
      // (next save would POST a duplicate quote_no — Codex P2).
      if (printOpen) {
        if (saveStatus !== 'saving') setPrintOpen(false);
      } else if (modalOpen) setModalOpen(false);
      else if (editMode) setEditMode(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen, editMode, printOpen, saveStatus]);

  return (
    <>
      <div className={styles.actionBar} data-no-edit>
        <button
          type="button"
          className={`${styles.editBtn} ${editMode ? styles.editBtnActive : ''}`}
          onClick={() => (editMode ? setEditMode(false) : setModalOpen(true))}
        >
          {editMode ? '✕ 結束編輯' : '編輯預覽'}
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!hasQuoteNo || saveStatus === 'saving'}
          title={hasQuoteNo ? '存到雲端（共享歷史紀錄）' : '報價單號尚未配發，無法存到雲端'}
        >
          {SAVE_LABEL[saveStatus]}
        </button>
        <button
          type="button"
          className={styles.printBtn}
          onClick={openPrint}
          disabled={!hasQuoteNo || saveStatus === 'saving'}
          title={hasQuoteNo ? '輸出 PDF（先存雲端 → 瀏覽器列印）' : '報價單號尚未配發，無法輸出'}
        >
          輸出 PDF
        </button>
      </div>

      {modalOpen && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-label="編輯預覽提醒"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className={styles.modalBox}>
            <div className={styles.modalTitle}>請注意</div>
            <div className={styles.modalMsg}>
              <strong>請優先使用左側欄位進行編輯</strong>，最後要調整的再來編輯這邊的內容。
              <br />
              （直接編輯預覽可能會讓金額計算不正確）
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setModalOpen(false)}
              >
                返回
              </button>
              <button
                type="button"
                className={styles.btnConfirm}
                onClick={() => {
                  setModalOpen(false);
                  setEditMode(true);
                }}
              >
                我了解了
              </button>
            </div>
          </div>
        </div>
      )}

      {printOpen && (
        <div
          className={styles.modal}
          role="dialog"
          aria-modal="true"
          aria-label="輸出 PDF"
          onClick={(e) => {
            if (e.target === e.currentTarget && saveStatus !== 'saving') setPrintOpen(false);
          }}
        >
          <div className={styles.modalBox}>
            <div className={styles.modalTitle}>輸出 PDF</div>
            <div className={styles.modalMsg}>
              {printStep === 'save' ? (
                <>
                  將先<strong>存到雲端</strong>（共享歷史紀錄），再輸出 PDF。
                </>
              ) : (
                <>
                  已存到雲端 ✓　接著按<strong>輸出 PDF</strong>，於列印視窗選「另存為 PDF」。
                </>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={() => setPrintOpen(false)}
                disabled={saveStatus === 'saving'}
              >
                返回
              </button>
              <button
                type="button"
                className={styles.btnConfirm}
                onClick={handlePrintAction}
                disabled={saveStatus === 'saving'}
              >
                {printStep === 'print'
                  ? '輸出 PDF'
                  : saveStatus === 'saving'
                    ? '儲存中…'
                    : saveStatus === 'error'
                      ? '儲存失敗，重試'
                      : '存到雲端'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
