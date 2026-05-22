// 付款資訊 — Session 3.
// Legacy ref: legacy.html line 1874-1895 (bp-payment) + 1996-2014 (preview).

import type { JSX } from 'react';

import { BPField } from '../../../components/BPField/BPField';
import { BPSection } from '../../../components/BPSection/BPSection';
import { useQuoteState } from '../../../state/QuoteContext';
import listStyles from './ListSection.module.scss';
import styles from './sections.module.scss';

export function PaymentSection(): JSX.Element {
  const { state, setPayment } = useQuoteState();
  const { payment } = state;
  return (
    <BPSection title="付款資訊">
      <label className={listStyles.fieldStacked}>
        <span>付款條件</span>
        <textarea
          rows={2}
          value={payment.terms}
          onChange={(e) => setPayment('terms', e.target.value)}
          placeholder="簽約時 50%&#10;驗收時 50%"
          aria-label="付款條件"
        />
      </label>
      <div className={styles.row}>
        <BPField
          label="幣別"
          compact
          value={payment.currency}
          onChange={(e) => setPayment('currency', e.target.value)}
        />
        <BPField
          label="付款方式"
          compact
          value={payment.method}
          onChange={(e) => setPayment('method', e.target.value)}
        />
      </div>
      <label className={listStyles.fieldStacked}>
        <span>交期 / 備註</span>
        <textarea
          rows={2}
          value={payment.deliveryNote}
          onChange={(e) => setPayment('deliveryNote', e.target.value)}
          placeholder="收款後 6 個工作週"
          aria-label="交期備註"
        />
      </label>
    </BPSection>
  );
}
