// Builder — top-level Builder route. Two-pane layout: form panel (left) +
// preview area (right), separated by a draggable divider that resizes the
// panel width (legacy.html line 3955-4003: mousedown→drag→clamp→persist,
// dblclick→reset, window-resize→re-clamp).
//
// Reviewer (Codex round 2 F6): QuoteProvider was lifted to App.tsx (above
// the router switch) so hash navigation Builder ⇄ History no longer
// unmounts the reducer and silently clears typed-in fields.

import { useCallback, useEffect, useRef, useState, type JSX } from 'react';

import styles from './Builder.module.scss';
import { BuilderPanel } from './BuilderPanel';
import { EditModeBar } from './EditModeBar';
import { PreviewPlaceholder } from './PreviewPlaceholder';

const MIN_W = 320; // legacy MIN_W
const A4_WIDTH_PX = 820; // legacy: keep room for the A4 preview (210mm ≈ 794px)
const DEFAULT_W = 520; // legacy default panel width
const STORAGE_KEY = 'aw_builder_width';

function clampWidth(w: number): number {
  const max = Math.max(MIN_W, window.innerWidth - A4_WIDTH_PX);
  return Math.max(MIN_W, Math.min(max, w));
}

export function Builder(): JSX.Element {
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const saved = parseInt(localStorage.getItem(STORAGE_KEY) ?? '', 10);
    const base = Number.isFinite(saved) && saved >= MIN_W ? saved : DEFAULT_W;
    // Clamp the default too: on viewports narrower than DEFAULT_W + A4_WIDTH_PX
    // an unclamped 520px panel would hide part of the A4 preview on first
    // render until a resize/drag re-clamps (Codex round-3 P2).
    return clampWidth(base);
  });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ startX: number; startW: number } | null>(null);
  const latestWidth = useRef(panelWidth);
  useEffect(() => {
    latestWidth.current = panelWidth;
  }, [panelWidth]);

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragOrigin.current = { startX: e.clientX, startW: panelWidth };
      setDragging(true);
      e.preventDefault();
    },
    [panelWidth],
  );

  // Document-level move/up listeners are only attached while dragging.
  useEffect(() => {
    if (!dragging) return;
    document.body.classList.add('divider-dragging');
    const onMove = (e: MouseEvent): void => {
      const origin = dragOrigin.current;
      if (!origin) return;
      setPanelWidth(clampWidth(origin.startW + (e.clientX - origin.startX)));
    };
    const onUp = (): void => {
      setDragging(false);
      dragOrigin.current = null;
      localStorage.setItem(STORAGE_KEY, String(latestWidth.current));
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('divider-dragging');
    };
  }, [dragging]);

  // Re-clamp when the window shrinks so the panel never hides the preview.
  useEffect(() => {
    const onResize = (): void => setPanelWidth((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const resetWidth = useCallback(() => {
    // Reset to the default, clamped to the current viewport so the dbl-click
    // reset never re-introduces a preview-hiding width (Codex round-3 P2).
    const w = clampWidth(DEFAULT_W);
    setPanelWidth(w);
    localStorage.setItem(STORAGE_KEY, String(w));
  }, []);

  return (
    <div
      className={`${styles.root} ${dragging ? styles.dragging : ''}`}
      style={{ '--builder-panel-width': `${panelWidth}px` } as React.CSSProperties}
    >
      <BuilderPanel />
      <div
        className={styles.divider}
        role="separator"
        aria-orientation="vertical"
        aria-label="拖拉調整面板寬度（雙擊重設）"
        title="拖拉調整寬度（雙擊重設）"
        onMouseDown={handleDividerMouseDown}
        onDoubleClick={resetWidth}
      />
      <PreviewPlaceholder />
      <EditModeBar />
    </div>
  );
}
