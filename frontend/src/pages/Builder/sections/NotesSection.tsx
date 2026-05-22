// 03 備註 — Session 3.
// Legacy ref: legacy.html line 1865-1872 (addNote) + 1988 (preview Remarks).

import type { JSX } from 'react';

import { BPSection } from '../../../components/BPSection/BPSection';
import { useQuoteState } from '../../../state/QuoteContext';
import styles from './GroupsSection.module.scss';
import listStyles from './ListSection.module.scss';

export function NotesSection(): JSX.Element {
  const { state, addNote, updateNote, removeNote } = useQuoteState();
  return (
    <BPSection
      title="03 備註"
      action={
        <button type="button" className={styles.miniBtn} onClick={() => addNote('')}>
          + 新增
        </button>
      }
    >
      {state.notes.length === 0 && <div className={listStyles.empty}>（按「+ 新增」加備註）</div>}
      {state.notes.map((n, i) => (
        <div key={i} className={listStyles.row}>
          <span className={listStyles.numBullet}>{i + 1}.</span>
          <textarea
            className={listStyles.textarea}
            value={n}
            rows={2}
            onChange={(e) => updateNote(i, e.target.value)}
            placeholder="例：若客戶需另增功能，需另行報價。"
            aria-label={`備註 ${i + 1}`}
          />
          <button
            type="button"
            className={listStyles.remove}
            onClick={() => removeNote(i)}
            aria-label={`移除備註 ${i + 1}`}
            title="移除"
          >
            ✕
          </button>
        </div>
      ))}
    </BPSection>
  );
}
