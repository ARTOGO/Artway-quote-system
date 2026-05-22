// Session-3 preview — pixel-precise legacy parity.
//
// User rule: 「目前做到的地方要跟原本長得一模一樣」.
//
// Renders the full A4 preview now: header + title band + parties + 01 Groups
// (Session 2) + ◎ Deliverables + 03 Notes + Payment table + Signature blocks
// (Session 3, legacy.html lines 1962-2059). Section 02 服務說明摘要 is
// intentionally deferred — legacy auto-derives it from item sub-groups +
// catalog templates; it's a Session 4 catalog-integration concern.

import type { JSX } from 'react';

import {
  calcGroupAdjustment,
  calcGroupSubtotal,
  calcGroupTax,
  calcGroupTotal,
  calcItemAmount,
  displaySubGroup,
  formatMoney,
  stripUnitSlash,
} from '../../lib/quoteCalc';
import { parseAppendixSections } from '../../lib/services';
import { useQuoteState } from '../../state/QuoteContext';
import type { QuoteGroup, QuotePayment, QuoteService } from '../../state/quoteTypes';
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
    <main className={styles.area} data-preview-root>
      <article className={styles.page} data-page>
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
        {/* 01 專案報價內容 — Session 2 (Groups) */}
        {state.groups.length > 0 && (
          <section className={styles.sectionWrap}>
            <div className={styles.sectionHd}>
              <span className={styles.sectionNum}>01</span>
              <div>
                <div className={styles.sectionZh}>專案報價內容</div>
                <div className={styles.sectionEn}>PROJECT QUOTATION</div>
              </div>
            </div>
            {state.groups.map((g) => (
              <GroupBlock key={g.id} group={g} />
            ))}
          </section>
        )}

        {/* ◎ 本案交付物 — Session 3 (Deliverables). Blank rows are filtered
            and the section hides when none remain (legacy renderDeliverables,
            line 2293) — Codex P3 #5. */}
        {state.deliverables.some((d) => d.trim() !== '') && (
          <section className={styles.sectionWrap}>
            <div className={styles.sectionHd}>
              <span className={`${styles.sectionNum} ${styles.sectionNumGlyph}`}>◎</span>
              <div>
                <div className={styles.sectionZh}>本案交付物</div>
                <div className={styles.sectionEn}>DELIVERABLES</div>
              </div>
            </div>
            <ul className={styles.deliverableGrid}>
              {state.deliverables
                .filter((d) => d.trim() !== '')
                .map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
            </ul>
          </section>
        )}

        {/* 02 服務說明摘要 — Session 4 (Services) */}
        <ServicesBlock services={state.services} />

        {/* 03 備註 — Session 3 (Notes / Remarks). Blank notes are skipped but
            numbering keeps the original index (legacy renderNotes, line 2496-
            2498) — Codex P3 #6. */}
        {state.notes.some((n) => n.trim() !== '') && (
          <section className={styles.sectionWrap}>
            <div className={styles.sectionHd}>
              <span className={styles.sectionNum}>03</span>
              <div>
                <div className={styles.sectionZh}>備註</div>
                <div className={styles.sectionEn}>REMARKS</div>
              </div>
            </div>
            <ol className={styles.notesList}>
              {state.notes.map((n, i) =>
                n.trim() === '' ? null : (
                  <li key={i}>
                    <span className={styles.noteNum}>{i + 1}.</span>
                    <span>{n}</span>
                  </li>
                ),
              )}
            </ol>
          </section>
        )}

        {/* 付款條件 table — Session 3 (Payment) */}
        <PaymentBlock payment={state.payment} />

        {/* 簽章區塊 — Session 3 (Client block blank for hand-signing + ARTWAY) */}
        <SignatureBlock
          salesName={sales.name}
          salesTitle={sales.title}
          issueDate={meta.issueDate}
        />

        {/* ARTOGO 指定帳戶 — Session 3 (bank account box) */}
        <BankAccountBox />

        {/* A4 頁尾 — Session 3 (company info + quote no) */}
        <PageFooter quoteNo={meta.quoteNo} />
      </article>

      {/* 附件頁 — Session 4 (Appendix; each sub_group on its own A4 page) */}
      <AppendixPages services={state.services} quoteNo={meta.quoteNo} />
    </main>
  );
}

// ─── 02 服務說明摘要 (legacy renderServicesPreview, line 2423) ─────────────
// One row per derived service that has either a user summary OR an included
// appendix. Rows with neither are skipped; the whole section hides when
// nothing qualifies (mirrors legacy `pvServicesWrap` display toggle).

function ServicesBlock({
  services,
}: {
  services: ReadonlyArray<QuoteService>;
}): JSX.Element | null {
  const rows = services.filter((s) => {
    const userSummary = (s.summary || '').trim();
    const showAppendix = s.hasAppendix && s.includeAppendix !== false;
    return userSummary !== '' || showAppendix;
  });
  if (rows.length === 0) return null;

  return (
    <section className={styles.sectionWrap}>
      <div className={styles.sectionHd}>
        <span className={styles.sectionNum}>02</span>
        <div>
          <div className={styles.sectionZh}>服務說明摘要</div>
          <div className={styles.sectionEn}>SERVICE SUMMARY</div>
        </div>
      </div>
      {rows.map((s) => {
        const userSummary = (s.summary || '').trim();
        const showAppendix = s.hasAppendix && s.includeAppendix !== false;
        const cleanSg = displaySubGroup(s.sub_group);
        return (
          <div key={s.sub_group} className={styles.svcSummaryRow}>
            <div className={styles.svcSummaryName}>{cleanSg}</div>
            {userSummary !== '' && <div className={styles.svcSummaryText}>{userSummary}</div>}
            {showAppendix && (
              <div className={styles.svcSummaryRef}>完整服務說明請見「附件 ｜ {cleanSg}」</div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ─── 附件頁 Appendix (legacy renderAppendix, line 2452) ───────────────────
// Each service that has an included, parseable service_description becomes
// its own A4 page (page-break-before). Lives outside the main .page article.

function AppendixPages({
  services,
  quoteNo,
}: {
  services: ReadonlyArray<QuoteService>;
  quoteNo: string;
}): JSX.Element | null {
  const pages = services
    .filter((s) => s.hasAppendix && s.includeAppendix !== false)
    .map((s) => ({ service: s, sections: parseAppendixSections(s.service_description) }))
    .filter((p) => p.sections.length > 0);

  if (pages.length === 0) return null;

  return (
    <>
      {pages.map(({ service, sections }) => (
        <section
          key={service.sub_group}
          className={`${styles.page} ${styles.appendixPage}`}
          data-page
        >
          <header className={styles.appendixHead}>
            <div className={styles.appendixLabel}>附件 APPENDIX</div>
            <div className={styles.appendixTitle}>
              {displaySubGroup(service.sub_group)}
              <span className={styles.appendixTitleSub}>SERVICE DESCRIPTION</span>
            </div>
            <div className={styles.appendixMeta}>QUOTE NO. {quoteNo || '—'}</div>
          </header>
          {sections.map((sec, i) => (
            <div key={i} className={styles.appendixSection}>
              {sec.title !== '' && <div className={styles.appendixSectionTitle}>{sec.title}</div>}
              <ul className={styles.appendixBullets}>
                {sec.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

// ─── Payment table (legacy.html 1995-2014) ────────────────────────────────
// Legacy renders the table unconditionally, with each cell falling back to
// "—" when its state value is empty. We preserve that exactly so the
// printed PDF always has the payment frame even on a fresh quote.

function PaymentBlock({ payment }: { payment: QuotePayment }): JSX.Element {
  return (
    <section className={`${styles.sectionWrap} ${styles.sectionWrapTight}`}>
      <table className={styles.paymentTable}>
        <thead>
          <tr>
            <th>付款條件</th>
            <th>幣別</th>
            <th>付款方式</th>
            <th>交期/備註</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{payment.terms || '—'}</td>
            <td>{payment.currency || '—'}</td>
            <td>{payment.method || '—'}</td>
            <td>{payment.deliveryNote || '—'}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// ─── Signature block (legacy.html 2016-2059) ──────────────────────────────
// Left = 客戶 ｜ CLIENT: name / title / date are ALWAYS blank underlined lines
// for hand-signing on the printed PDF — legacy renderSig keeps the client
// block empty ("客戶簽署區永遠空白（給客戶手寫）", legacy.html:2515-2518). We
// must NOT pre-fill the client contact name/title here, or an unsigned quote
// would look customer-confirmed (Codex round-4 P2).
// Right = 承辦 ｜ ARTWAY: salesperson name/title + the quote's issue date + the
// ARTWAY 公司章 image (lives under /logo/).

function SignatureBlock({
  salesName,
  salesTitle,
  issueDate,
}: {
  salesName: string;
  salesTitle: string;
  issueDate: string;
}): JSX.Element {
  return (
    <section className={styles.sigSection}>
      <div className={styles.sigBlock}>
        <div className={styles.sigLabel}>客戶確認 ｜ CLIENT</div>
        <div className={styles.sigRow}>
          <div className={styles.sigField}>
            <div className={styles.sigFieldLbl}>姓名 Name</div>
            <div className={styles.sigLine}></div>
          </div>
          <div className={styles.sigField}>
            <div className={styles.sigFieldLbl}>職稱 Title</div>
            <div className={styles.sigLine}></div>
          </div>
        </div>
        <div className={styles.sigRow}>
          <div className={styles.sigField}>
            <div className={styles.sigFieldLbl}>日期 Date</div>
            <div className={styles.sigLine}></div>
          </div>
        </div>
        <div className={styles.sigStamp}>簽章 Signature / Seal</div>
      </div>
      <div className={styles.sigBlock}>
        <div className={styles.sigLabel}>承辦 ｜ ARTWAY</div>
        <div className={styles.sigRow}>
          <div className={styles.sigField}>
            <div className={styles.sigFieldLbl}>姓名 Name</div>
            <div className={styles.sigLine}>{salesName || '—'}</div>
          </div>
          <div className={styles.sigField}>
            <div className={styles.sigFieldLbl}>職稱 Title</div>
            <div className={styles.sigLine}>{salesTitle || '—'}</div>
          </div>
        </div>
        <div className={styles.sigRow}>
          <div className={styles.sigField}>
            <div className={styles.sigFieldLbl}>日期 Date</div>
            {/* Legacy line 2514: the ARTWAY signature date is the quote's
                issue date (so a back-dated quote prints consistent dates),
                not the browser's current date — Codex P2 #3. */}
            <div className={styles.sigLine}>{issueDate || '—'}</div>
          </div>
        </div>
        <div className={`${styles.sigStamp} ${styles.sigStampFilled}`}>
          <img src="/logo/藝途發票章＿新.png" alt="ARTWAY 公司章" />
        </div>
      </div>
    </section>
  );
}

// ─── ARTOGO 指定帳戶 (legacy.html 2061-2066) ──────────────────────────────
// Static bank-account block — values are fixed company data (never derived
// from quote state), so they're hardcoded exactly as legacy does.
const BANK_NAME = '華南商業銀行　南台中分行';
const BANK_HOLDER = '藝途科技股份有限公司';
const BANK_ACCOUNT = '422100098615';

function BankAccountBox(): JSX.Element {
  return (
    <div className={styles.bankAccountBox}>
      <div className={styles.bankAccountTitle}>ARTOGO 指定帳戶 ｜ DESIGNATED ACCOUNT</div>
      <div className={styles.bankAccountRow}>
        <span className={styles.baLbl}>銀行</span>
        <span className={styles.baVal}>{BANK_NAME}</span>
      </div>
      <div className={styles.bankAccountRow}>
        <span className={styles.baLbl}>戶名</span>
        <span className={styles.baVal}>{BANK_HOLDER}</span>
      </div>
      <div className={styles.bankAccountRow}>
        <span className={styles.baLbl}>帳號</span>
        <span className={styles.baVal}>{BANK_ACCOUNT}</span>
      </div>
    </div>
  );
}

// ─── A4 頁尾 (legacy.html 2068-2071) ──────────────────────────────────────
// Left: fixed company line. Right: the quote number (empty quote → "—",
// matching legacy `#pvFooterNo` default).
const FOOTER_COMPANY = '藝途科技股份有限公司｜統編 90841095｜110 台北市信義區基隆路二段 56 號 4 樓';

function PageFooter({ quoteNo }: { quoteNo: string }): JSX.Element {
  // data-no-edit: never contenteditable in edit mode (legacy footer too).
  return (
    <footer className={styles.pageFooter} data-no-edit>
      <span>{FOOTER_COMPANY}</span>
      <span>{quoteNo || '—'}</span>
    </footer>
  );
}

// ─── 01 專案報價內容 Group block ──────────────────────────────────────────

function GroupBlock({ group }: { group: QuoteGroup }): JSX.Element {
  const hasDiscount = group.hasDiscount ?? false;
  const subtotal = calcGroupSubtotal(group);
  const tax = calcGroupTax(subtotal);
  const adjustment = calcGroupAdjustment(group);
  const total = calcGroupTotal(group);
  const colSpan = hasDiscount ? 7 : 6;
  const showAdjustmentRow =
    (group.hasAdjustment ?? false) && (adjustment !== 0 || (group.adjustment?.label ?? '') !== '');

  return (
    <div className={styles.quoteGroup}>
      <div className={styles.groupTitle}>{group.title}</div>
      <table className={styles.qt}>
        <thead>
          <tr>
            <th className={styles.colNo}>No.</th>
            <th className={styles.colCategory}>Category</th>
            <th className={styles.colDesc}>Description</th>
            <th className={`${styles.qtyUnit} ${styles.colQty}`}>Qty</th>
            <th className={`${styles.r} ${styles.colUnitPrice}`}>Unit Price</th>
            {hasDiscount && <th className={`${styles.r} ${styles.colDiscount}`}>Discount</th>}
            <th className={`${styles.r} ${styles.colAmount}`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {group.items.length === 0 ? (
            <tr>
              <td colSpan={colSpan} className={styles.qtEmpty}>
                （左側加入品項後會顯示在這裡）
              </td>
            </tr>
          ) : (
            group.items.map((it, i) => {
              const disc = Number(it.discount) || 0;
              const unit = stripUnitSlash(it.unit);
              return (
                <tr key={it.id}>
                  <td className={styles.no}>{String(i + 1).padStart(2, '0')}</td>
                  <td className={styles.subCat}>{displaySubGroup(it.sub_group)}</td>
                  <td className={styles.desc}>{it.name}</td>
                  <td className={styles.qtyUnit}>
                    {it.qty}
                    {unit ? ' ' + unit : ''}
                  </td>
                  <td className={styles.r}>{formatMoney(Number(it.unitPrice))}</td>
                  {hasDiscount && (
                    <td className={styles.r}>{disc > 0 ? '−' + formatMoney(disc) : '—'}</td>
                  )}
                  <td className={styles.r}>{formatMoney(calcItemAmount(it, hasDiscount))}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <div className={styles.groupTotals}>
        <div className={styles.totalsBox}>
          <div className={styles.totalsRow}>
            <span>小計 Subtotal</span>
            <span>NT$ {formatMoney(subtotal)}</span>
          </div>
          <div className={styles.totalsRow}>
            <span>營業稅 Tax 5%</span>
            <span>NT$ {formatMoney(tax)}</span>
          </div>
          {showAdjustmentRow && (
            <div className={styles.totalsRow}>
              <span>{group.adjustment?.label || '金額異動 Adjustment'}</span>
              <span>
                {adjustment < 0 ? '−' : ''}NT$ {formatMoney(Math.abs(adjustment))}
              </span>
            </div>
          )}
          <div className={styles.totalsGrand}>
            <span>{group.title}　總價</span>
            <span>NT$ {formatMoney(total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
