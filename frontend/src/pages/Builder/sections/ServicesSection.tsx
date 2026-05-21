// 02 服務說明摘要 — Session 4.
//
// Auto-derived from the items in 01 專案報價內容: one row per distinct
// sub_group. Business can add an optional summary line and, for sub_groups
// that carry a catalog service_description, toggle whether the appendix page
// (+「請見附件」reference) is included.
//
// Legacy ref: legacy.html refreshServicesUI (line 2379) + the #bp-services
// section markup (line 1856-1862).

import type { JSX } from 'react';

import { BPSection } from '../../../components/BPSection/BPSection';
import { displaySubGroup } from '../../../lib/quoteCalc';
import { useQuoteState } from '../../../state/QuoteContext';
import styles from './ServicesSection.module.scss';

export function ServicesSection(): JSX.Element {
  const { state, updateService } = useQuoteState();
  const { services } = state;

  return (
    <BPSection title="02 服務說明摘要">
      {services.length === 0 ? (
        <div className={styles.empty}>尚未加入任何品項，加入後對應服務摘要會出現在這裡。</div>
      ) : (
        services.map((s) => {
          const showAppendix = s.hasAppendix && s.includeAppendix !== false;
          const placeholder = s.hasAppendix
            ? '可額外加摘要文字（選填，若不填預覽只顯示「請見附件」）'
            : '請填寫服務摘要（不填則此副品項不會出現在報價單上）';
          return (
            <div key={s.sub_group} className={styles.item}>
              <div className={styles.head}>
                {s.hasAppendix && (
                  <label className={styles.inclToggle} title="是否在報價單顯示「請見附件」與附件頁">
                    <input
                      type="checkbox"
                      checked={s.includeAppendix !== false}
                      onChange={(e) =>
                        updateService(s.sub_group, { includeAppendix: e.target.checked })
                      }
                      aria-label={`含附件 ${s.sub_group}`}
                    />
                    <span>含附件</span>
                  </label>
                )}
                <div className={styles.title}>{s.sub_group}</div>
              </div>
              {showAppendix && (
                <div className={styles.note}>
                  完整服務說明請見「附件 ｜ {displaySubGroup(s.sub_group)}」
                </div>
              )}
              <textarea
                className={styles.summary}
                rows={2}
                value={s.summary}
                onChange={(e) => updateService(s.sub_group, { summary: e.target.value })}
                placeholder={placeholder}
                aria-label={`服務摘要 ${s.sub_group}`}
              />
            </div>
          );
        })
      )}
    </BPSection>
  );
}
