// 業務聯絡人 (ARTWAY From) — name / title / phone / email.
//
// UX behaviour: 業務聯絡人欄位會記在 localStorage（per-browser），下一次開
// 新報價時自動帶回來。如果使用者載入的是「已存的舊報價」並且裡面已經有
// sales 欄位，那以該報價的值為準，不會被 localStorage 覆寫。

import { useEffect, useRef, type JSX } from 'react';

import { BPField } from '../../../components/BPField/BPField';
import { BPSection } from '../../../components/BPSection/BPSection';
import { useQuoteState } from '../../../state/QuoteContext';
import { ARTWAY_DEFAULT_PHONE } from '../../../state/quoteReducer';
import styles from './sections.module.scss';

const LS_KEY = 'aw_sales_contact_v1';

type RememberedSales = {
  name: string;
  title: string;
  phone: string;
  email: string;
};

function readRemembered(): RememberedSales | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedSales>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
    };
  } catch {
    return null;
  }
}

function writeRemembered(s: RememberedSales): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    // localStorage might be unavailable (e.g. private mode) — silently skip
  }
}

export function SalesSection(): JSX.Element {
  const { state, setSales } = useQuoteState();
  const hydratedRef = useRef(false);

  // ─── Hydrate from localStorage once on mount ──────────────────────────────
  // Only fill fields that are still on their "blank quote" defaults. If the
  // user opened an existing quote with a sales person filled in, we keep that.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const remembered = readRemembered();
    if (!remembered) return;
    // name / title / email default to '' on a blank quote; phone defaults to
    // ARTWAY_DEFAULT_PHONE. Only overwrite when current value is the blank
    // default — never clobber a value the loaded quote brought.
    if (state.sales.name === '' && remembered.name) setSales('name', remembered.name);
    if (state.sales.title === '' && remembered.title) setSales('title', remembered.title);
    if (state.sales.email === '' && remembered.email) setSales('email', remembered.email);
    if (state.sales.phone === ARTWAY_DEFAULT_PHONE && remembered.phone) {
      setSales('phone', remembered.phone);
    }
    // Intentionally exclude state.sales.* from deps — we want a single
    // hydration pass on mount, not re-runs as fields change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Persist every change ─────────────────────────────────────────────────
  useEffect(() => {
    writeRemembered({
      name: state.sales.name,
      title: state.sales.title,
      phone: state.sales.phone,
      email: state.sales.email,
    });
  }, [state.sales.name, state.sales.title, state.sales.phone, state.sales.email]);

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
