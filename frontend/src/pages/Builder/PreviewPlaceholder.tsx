// Session-1 preview placeholder.
//
// User rule: 「目前做到的地方要跟原本長得一模一樣」 — so this component
// renders ONLY the legacy preview header + title band + parties section,
// pixel-precise. Sections 01 / 02 / 03 / 付款 / 簽章 (legacy.html lines
// 1959-2055) are Session 2-3 territory — we render nothing for them
// rather than show a fake placeholder box that misleads business users.

import type { JSX } from 'react';

import { useQuoteState } from '../../state/QuoteContext';
import styles from './PreviewPlaceholder.module.scss';

// Hardcoded ARTWAY company info on the From party — legacy renders these
// as fixed values regardless of state (only 聯絡人 line draws from
// state.sales.name). See legacy.html line 1942-1957.
const ARTWAY_COMPANY = '藝途科技股份有限公司';
const ARTWAY_DEFAULT_PHONE = '02-7752-8899';
const ARTWAY_DEFAULT_ADDRESS = '110 台北市信義區基隆路二段 56 號 4 樓';
const ARTWAY_TAX_ID = '90841095';

export function PreviewPlaceholder(): JSX.Element {
  const { state } = useQuoteState();
  const { meta, client, sales } = state;

  // Client party info — empty defaults render as legacy's "—"
  const clientInfoLines: string[] = [];
  if (client.contactName || client.contactTitle) {
    clientInfoLines.push(
      `聯絡人：${[client.contactName, client.contactTitle].filter(Boolean).join(' / ')}`,
    );
  }
  if (client.phone) clientInfoLines.push(`電話：${client.phone}`);
  if (client.email) clientInfoLines.push(`Email：${client.email}`);
  if (client.address) clientInfoLines.push(`地址：${client.address}`);
  if (client.taxId) clientInfoLines.push(`統一編號：${client.taxId}`);

  return (
    <main className={styles.area}>
      <article className={styles.page}>
        <header className={styles.docHeader}>
          <div className={styles.logoZone}>
            <img src="/logo/ARTWAY_logo_黑_橫式.png" alt="ARTWAY" />
          </div>
          <div className={styles.headerRight}>
            <div className={styles.docTitle}>QUOTATION</div>
            <table className={styles.metaTable}>
              <tbody>
                <tr>
                  <td>QUOTE NO.</td>
                  <td>{meta.quoteNo || '—'}</td>
                </tr>
                <tr>
                  <td>ISSUE DATE</td>
                  <td>{meta.issueDate || '—'}</td>
                </tr>
                <tr>
                  <td>VALID UNTIL</td>
                  <td>{meta.validUntil || '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </header>

        {meta.title !== '' && <div className={styles.docTitleBand}>{meta.title}</div>}

        <div className={styles.parties}>
          <div className={styles.party}>
            <div className={styles.partyLabel}>Bill To ｜ 客戶資訊</div>
            <div className={styles.partyName}>{client.company || '—'}</div>
            <div className={styles.partyInfo}>
              {clientInfoLines.length === 0
                ? '—'
                : clientInfoLines.map((line, i) => (
                    <span key={i} className={styles.partyInfoLine}>
                      {line}
                    </span>
                  ))}
            </div>
          </div>
          <div className={styles.party}>
            <div className={styles.partyLabel}>From ｜ 我方資訊</div>
            <div className={styles.partyName}>{ARTWAY_COMPANY}</div>
            <div className={styles.partyInfo}>
              <span className={styles.partyInfoLine}>
                聯絡人：
                {[sales.name, sales.title].filter(Boolean).join(' / ') || '—'}
              </span>
              <span className={styles.partyInfoLine}>
                電話：{sales.phone || ARTWAY_DEFAULT_PHONE}
              </span>
              {sales.email && <span className={styles.partyInfoLine}>Email：{sales.email}</span>}
              <span className={styles.partyInfoLine}>地址：{ARTWAY_DEFAULT_ADDRESS}</span>
              <span className={styles.partyInfoLine}>統一編號：{ARTWAY_TAX_ID}</span>
            </div>
          </div>
        </div>
        {/*
          Session 2-3 將在此補上：
          - 01 專案報價內容（Groups 表格 + 小計 / Tax / 總價）
          - ◎ 本案交付物（Deliverables）
          - 02 服務說明摘要
          - 03 備註（Remarks）
          - 付款條件 table
          - 客戶 / ARTWAY 簽章區塊
          Session 1 範圍只到 parties，下方刻意留白、不放假 placeholder。
        */}
      </article>
    </main>
  );
}
