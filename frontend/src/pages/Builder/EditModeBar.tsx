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
// Scope note: the legacy action bar also has 儲存 (cloud save) and 輸出 PDF.
// Those need the backend wiring + print flow (Session 5) and are intentionally
// omitted here.

import { useEffect, useState, type JSX } from 'react';

import styles from './EditModeBar.module.scss';

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
  const [editMode, setEditMode] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

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
      if (modalOpen) setModalOpen(false);
      else if (editMode) setEditMode(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen, editMode]);

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
    </>
  );
}
