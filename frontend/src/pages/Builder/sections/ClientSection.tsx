// 客戶資訊 (Bill To) — company / contact / phone / email / address / taxId.

import type { JSX } from 'react';

import { BPField } from '../../../components/BPField/BPField';
import { BPSection } from '../../../components/BPSection/BPSection';
import { useQuoteState } from '../../../state/QuoteContext';
import styles from './sections.module.scss';

export function ClientSection(): JSX.Element {
  const { state, setClient } = useQuoteState();
  return (
    <BPSection title="客戶資訊（Bill To）" compact>
      <BPField
        label="公司名稱"
        compact
        placeholder="台灣當代藝術館"
        value={state.client.company}
        onChange={(e) => setClient('company', e.target.value)}
      />
      <div className={styles.row}>
        <BPField
          label="姓名"
          compact
          placeholder="陳美玲"
          value={state.client.contactName}
          onChange={(e) => setClient('contactName', e.target.value)}
        />
        <BPField
          label="職稱"
          compact
          placeholder="館長"
          value={state.client.contactTitle}
          onChange={(e) => setClient('contactTitle', e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <BPField
          label="電話"
          compact
          value={state.client.phone}
          onChange={(e) => setClient('phone', e.target.value)}
        />
        <BPField
          label="Email"
          compact
          type="email"
          value={state.client.email}
          onChange={(e) => setClient('email', e.target.value)}
        />
      </div>
      <BPField
        label="地址"
        compact
        value={state.client.address}
        onChange={(e) => setClient('address', e.target.value)}
      />
      <BPField
        label="統一編號"
        compact
        value={state.client.taxId}
        onChange={(e) => setClient('taxId', e.target.value)}
      />
    </BPSection>
  );
}
