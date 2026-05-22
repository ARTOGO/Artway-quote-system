// 基本資訊 — title / quoteNo / issueDate / validUntil.
//
// quoteNo is readonly and blank until the quote is first saved: the backend
// allocates the AW-... serial at save time (POST /quotes), and the create
// response stamps it into state (see useSaveQuote / SET_SAVED). So refreshing
// or previewing an unsaved quote never burns a serial.

import type { JSX } from 'react';

import { BPField } from '../../../components/BPField/BPField';
import { BPSection } from '../../../components/BPSection/BPSection';
import { useQuoteState } from '../../../state/QuoteContext';
import styles from './sections.module.scss';

export function MetaSection(): JSX.Element {
  const { state, setMeta } = useQuoteState();
  return (
    <BPSection title="基本資訊" compact>
      <BPField
        label="專案名稱"
        compact
        placeholder="可不填，留空則不顯示在報價單上"
        value={state.meta.title}
        onChange={(e) => setMeta('title', e.target.value)}
      />
      <BPField
        label="報價單編號"
        compact
        placeholder="（儲存後配發）"
        readOnly
        title="報價單編號為永久 ID，存到雲端時自動配發、之後不可變更"
        value={state.meta.quoteNo}
        onChange={() => {
          // readonly — never invoked, but onChange is required for controlled input
        }}
      />
      <div className={styles.row}>
        <BPField
          label="開立日期"
          compact
          type="date"
          value={state.meta.issueDate}
          onChange={(e) => setMeta('issueDate', e.target.value)}
        />
        <BPField
          label="有效日期"
          compact
          type="date"
          value={state.meta.validUntil}
          onChange={(e) => setMeta('validUntil', e.target.value)}
        />
      </div>
    </BPSection>
  );
}
