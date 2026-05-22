// 本案交付物 — Session 3.
// Legacy ref: legacy.html line 1847-1854 (addDeliverable) + 1966 (preview).

import type { JSX } from 'react';

import { BPSection } from '../../../components/BPSection/BPSection';
import { useQuoteState } from '../../../state/QuoteContext';
import styles from './GroupsSection.module.scss';
import listStyles from './ListSection.module.scss';

export function DeliverablesSection(): JSX.Element {
  const { state, addDeliverable, updateDeliverable, removeDeliverable } = useQuoteState();
  return (
    <BPSection
      title="本案交付物"
      action={
        <button type="button" className={styles.miniBtn} onClick={() => addDeliverable('')}>
          + 新增
        </button>
      }
    >
      {state.deliverables.length === 0 && (
        <div className={listStyles.empty}>（按「+ 新增」加交付項目）</div>
      )}
      {state.deliverables.map((d, i) => (
        <div key={i} className={listStyles.row}>
          <span className={listStyles.bullet}>•</span>
          <input
            type="text"
            className={listStyles.input}
            value={d}
            onChange={(e) => updateDeliverable(i, e.target.value)}
            placeholder="例：AR 立體攝影檔（含後製）"
            aria-label={`交付項目 ${i + 1}`}
          />
          <button
            type="button"
            className={listStyles.remove}
            onClick={() => removeDeliverable(i)}
            aria-label={`移除交付項目 ${i + 1}`}
            title="移除"
          >
            ✕
          </button>
        </div>
      ))}
    </BPSection>
  );
}
