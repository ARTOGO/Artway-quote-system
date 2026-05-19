// 業務聯絡人 (ARTWAY From) — name / title / phone / email.

import type { JSX } from 'react';

import { BPField } from '../../../components/BPField/BPField';
import { BPSection } from '../../../components/BPSection/BPSection';
import { useQuoteState } from '../../../state/QuoteContext';
import styles from './sections.module.scss';

export function SalesSection(): JSX.Element {
  const { state, setSales } = useQuoteState();
  return (
    <BPSection title="業務聯絡人（ARTWAY From）" compact>
      <div className={styles.row}>
        <BPField
          label="姓名"
          compact
          value={state.sales.name}
          onChange={(e) => setSales('name', e.target.value)}
        />
        <BPField
          label="職稱"
          compact
          value={state.sales.title}
          onChange={(e) => setSales('title', e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <BPField
          label="電話"
          compact
          value={state.sales.phone}
          onChange={(e) => setSales('phone', e.target.value)}
        />
        <BPField
          label="Email"
          compact
          type="email"
          value={state.sales.email}
          onChange={(e) => setSales('email', e.target.value)}
        />
      </div>
    </BPSection>
  );
}
