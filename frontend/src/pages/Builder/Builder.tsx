// Builder — top-level Builder route. Two-pane layout: form panel (left) +
// preview area (right). The draggable divider lands in Session 5; for now
// the panel width is fixed at 520px (legacy default).
//
// Reviewer (Codex round 2 F6): QuoteProvider was lifted to App.tsx (above
// the router switch) so hash navigation Builder ⇄ History no longer
// unmounts the reducer and silently clears typed-in fields.

import type { JSX } from 'react';

import styles from './Builder.module.scss';
import { BuilderPanel } from './BuilderPanel';
import { PreviewPlaceholder } from './PreviewPlaceholder';

export function Builder(): JSX.Element {
  return (
    <div className={styles.root}>
      <BuilderPanel />
      <div className={styles.divider} aria-hidden />
      <PreviewPlaceholder />
    </div>
  );
}
