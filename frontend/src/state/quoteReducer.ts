// Quote reducer — pure function, easy to unit-test.
//
// Replaces the legacy global `state` mutation + manual re-render pattern
// (legacy.html line 2086 + 2670+). React + useReducer gives us:
//   1) immutable snapshots → DevTools time-travel + React.memo works
//   2) typed actions → compiler catches misspelled fields
//   3) testable transitions → see quoteReducer.test.ts

import { addDaysISO, todayISO } from '../lib/dates';
import { groupTitleFor, newGroupId } from '../lib/groupId';
import { syncServices } from '../lib/services';
import type { Quote, QuoteAction, QuoteGroup, QuoteStatus } from './quoteTypes';

/**
 * Default disclaimer notes seeded on every fresh quote — verbatim from
 * legacy.html `newQuote()` (line 3846-3850). Business expects these three
 * to already be present (and printed) the moment a new quote opens; an
 * empty 03 備註 block was a Session-3 parity regression caught in visual QA.
 */
export const DEFAULT_NOTES: readonly string[] = [
  '若對本報價尚有未能釋疑之處，歡迎與本報價單聯繫窗口或其代理人聯絡。',
  '客戶需確保所提供素材（文字稿、圖片、音檔等）之著作權，並擔保其責任。',
  '本報價單回簽視同正式訂單，若後續有協議調整，應以書面補充協議或另簽新報價單。若簽訂合約，雙方權利義務應以合約為主。',
];

/**
 * Default payment terms / delivery note — verbatim from legacy `newQuote()`
 * (line 3844-3845). These render directly into the printed payment table,
 * so an empty default showed "—" in the PDF instead of the standard terms.
 */
export const DEFAULT_PAYMENT_TERMS = '簽約時 50%\n驗收時 50%';
export const DEFAULT_DELIVERY_NOTE = '收款後 6 個工作週';

/**
 * One starter quote group, mirroring legacy `newQuote()` → `addQuoteGroup()`
 * (legacy.html line 2574-2582 + 3858). A fresh quote always opens with an
 * empty `A-1．（請輸入組別名稱）` group so the preview's "01 專案報價內容"
 * block is present from the first keystroke — an empty groups array was a
 * Session-3 parity gap caught in visual QA (preview showed nothing for 01).
 *
 * The group id is random (legacy `g_<ts>_<rand>`), so this is built fresh
 * on each createBlankQuote() call — never shared across quotes.
 */
function createStarterGroup(): QuoteGroup {
  return {
    id: newGroupId(),
    seq: 1,
    title: groupTitleFor(1),
    items: [],
    hasDiscount: false,
    autoDiscount: false,
    hasAdjustment: false,
    adjustment: { label: '', amount: 0 },
  };
}

/**
 * Re-derive `state.services` from the current items (legacy `renderGroups →
 * renderServices`). Called after any item / group mutation so the 02 服務
 * 摘要 + appendix always reflect the items present, while preserving the
 * user's per-sub_group summary / includeAppendix edits.
 */
// Public so SalesSection can override with the per-user remembered values
// from localStorage (see useRememberedSalesContact). Centralising the literal
// here means changing the company main line only needs one edit.
export const ARTWAY_DEFAULT_PHONE = '02-2578-8901';

function reSyncServices(state: Quote): Quote {
  return { ...state, services: syncServices(state.groups, state.services) };
}

/**
 * Build a blank quote with sensible defaults. The legacy app applied these
 * defaults inline (`payment.currency = '新台幣 NTD'`, `sales.phone =
 * ARTWAY_DEFAULT_PHONE`); centralising them here means new quotes load
 * uniformly regardless of caller.
 *
 * - `issueDate`  → today (browser local)
 * - `validUntil` → today + 15 days (matches legacy line 3727 + 3843)
 *
 * Reviewer note (Codex P2): an earlier draft used 30 days; legacy production
 * uses 15. The Builder + preview surface validUntil directly, so any drift
 * would change every new quote business sends out — keep parity until/unless
 * product explicitly bumps it.
 */
export function createBlankQuote(): Quote {
  return {
    id: null,
    status: 'draft',
    meta: {
      title: '',
      quoteNo: '',
      issueDate: todayISO(),
      validUntil: addDaysISO(15),
    },
    client: {
      company: '',
      contactName: '',
      contactTitle: '',
      phone: '',
      email: '',
      address: '',
      taxId: '',
    },
    clientSig: { sameAsClient: true, name: '', title: '' },
    sales: { name: '', title: '', phone: ARTWAY_DEFAULT_PHONE, email: '' },
    groups: [createStarterGroup()],
    deliverables: [],
    services: [],
    notes: [...DEFAULT_NOTES],
    payment: {
      terms: DEFAULT_PAYMENT_TERMS,
      currency: '新台幣 NTD',
      method: '銀行轉帳',
      deliveryNote: DEFAULT_DELIVERY_NOTE,
    },
  };
}

// 'template' is a status. 'executed' dropped in migration 0003.
const VALID_STATUSES: readonly QuoteStatus[] = ['draft', 'sent', 'signed', 'template'];

function isValidStatus(s: string): s is QuoteStatus {
  return (VALID_STATUSES as readonly string[]).includes(s);
}

export function quoteReducer(state: Quote, action: QuoteAction): Quote {
  switch (action.type) {
    case 'SET_STATUS': {
      if (!isValidStatus(action.status)) return state;
      if (state.status === action.status) return state;
      return { ...state, status: action.status };
    }
    case 'SET_QUOTE_NO': {
      if (state.meta.quoteNo === action.quoteNo) return state;
      return { ...state, meta: { ...state.meta, quoteNo: action.quoteNo } };
    }
    case 'SET_SAVED': {
      // Stamp the backend-assigned UUID (so a subsequent save PUTs the same row)
      // and, for a brand-new quote, the server-allocated quote_no (assigned at
      // save time, not on Builder mount — so refreshing an unsaved quote never
      // burns a serial). Guard against a stale completion: if the user switched
      // quotes (新報價 / load) mid-save, the current quote_no no longer matches
      // the one we saved, so dropping the stamp avoids attaching the row to a
      // different quote (Codex P1).
      if (state.meta.quoteNo !== action.forQuoteNo) return state;
      const meta =
        action.quoteNo && action.quoteNo !== state.meta.quoteNo
          ? { ...state.meta, quoteNo: action.quoteNo }
          : state.meta;
      if (state.id === action.id && meta === state.meta) return state;
      return { ...state, id: action.id, meta };
    }
    case 'SET_META': {
      if (state.meta[action.field] === action.value) return state;
      return { ...state, meta: { ...state.meta, [action.field]: action.value } };
    }
    case 'SET_CLIENT': {
      if (state.client[action.field] === action.value) return state;
      return { ...state, client: { ...state.client, [action.field]: action.value } };
    }
    case 'SET_SALES': {
      if (state.sales[action.field] === action.value) return state;
      return { ...state, sales: { ...state.sales, [action.field]: action.value } };
    }
    // ─── Groups ──────────────────────────────────────────────────────────
    case 'ADD_GROUP':
      return { ...state, groups: [...state.groups, action.group] };
    case 'REMOVE_GROUP':
      return reSyncServices({
        ...state,
        groups: state.groups.filter((g) => g.id !== action.gid),
      });
    case 'RENAME_GROUP': {
      // Reviewer (Gemini G5): the prior version always created a new
      // `{ ...g, title }` object even when the title was unchanged, so the
      // every-strict-equal guard never short-circuited. Only spawn a new
      // group object when the title actually differs.
      const groups = state.groups.map((g) =>
        g.id === action.gid && g.title !== action.title ? { ...g, title: action.title } : g,
      );
      if (groups.every((g, i) => g === state.groups[i])) return state;
      return { ...state, groups };
    }
    case 'ADD_ITEM': {
      const groups = state.groups.map((g) =>
        g.id === action.gid ? { ...g, items: [...g.items, action.item] } : g,
      );
      return reSyncServices({ ...state, groups });
    }
    case 'REMOVE_ITEM': {
      const groups = state.groups.map((g) =>
        g.id === action.gid ? { ...g, items: g.items.filter((it) => it.id !== action.itemId) } : g,
      );
      return reSyncServices({ ...state, groups });
    }
    case 'UPDATE_ITEM': {
      const groups = state.groups.map((g) => {
        if (g.id !== action.gid) return g;
        const items = g.items.map((it) =>
          it.id === action.itemId ? { ...it, ...action.patch } : it,
        );
        return { ...g, items };
      });
      // sub_group edits change the derived services; re-sync (idempotent for
      // qty/price/discount-only patches — preserves summary/includeAppendix).
      return reSyncServices({ ...state, groups });
    }
    case 'MOVE_ITEM': {
      const { fromIndex, toIndex } = action;
      const groups = state.groups.map((g) => {
        if (g.id !== action.gid) return g;
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= g.items.length ||
          toIndex >= g.items.length
        ) {
          return g;
        }
        const items = g.items.slice();
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        return { ...g, items };
      });
      if (groups.every((g, i) => g === state.groups[i])) return state;
      // Item order doesn't change the derived service set, but re-syncing is
      // cheap + harmless (sub_group order could shift; preserves user edits).
      return reSyncServices({ ...state, groups });
    }
    // ─── Group discount / adjustment (Session 2.5) ─────────────────────────
    case 'SET_GROUP_DISCOUNT': {
      const groups = state.groups.map((g) => {
        if (g.id !== action.gid || g.hasDiscount === action.hasDiscount) return g;
        // Turning the column off also clears auto-discount (legacy line 2629).
        return {
          ...g,
          hasDiscount: action.hasDiscount,
          autoDiscount: action.hasDiscount ? g.autoDiscount : false,
        };
      });
      if (groups.every((g, i) => g === state.groups[i])) return state;
      return { ...state, groups };
    }
    case 'SET_GROUP_AUTO_DISCOUNT': {
      const groups = state.groups.map((g) => {
        if (g.id !== action.gid) return g;
        let items = g.items;
        if (action.autoDiscount) {
          // applyAutoDiscount (legacy line 2562): list price + auto price-gap.
          items = g.items.map((it) => {
            if (it.isManual) return it;
            const ps = Number(it.priceStandard);
            // Skip rows without a valid standard price (legacy applyAutoDiscount
            // `if isNaN(ps) continue`; blank prices normalise to 0 here, so
            // guard on `> 0` to avoid zeroing an arts-only item).
            if (!(ps > 0)) return it;
            const pa = Number(it.priceArts);
            return {
              ...it,
              priceTier: 'price_standard',
              unitPrice: ps,
              discount: pa > 0 ? Math.max(0, ps - pa) : 0,
            };
          });
        }
        return { ...g, autoDiscount: action.autoDiscount, items };
      });
      return { ...state, groups };
    }
    case 'SET_GROUP_ADJUSTMENT_ENABLED': {
      const groups = state.groups.map((g) => {
        if (g.id !== action.gid) return g;
        return {
          ...g,
          hasAdjustment: action.hasAdjustment,
          adjustment: g.adjustment ?? { label: '', amount: 0 },
        };
      });
      return { ...state, groups };
    }
    case 'SET_GROUP_ADJUSTMENT': {
      const groups = state.groups.map((g) => {
        if (g.id !== action.gid) return g;
        const adjustment = g.adjustment ?? { label: '', amount: 0 };
        if (action.field === 'amount') {
          const v = parseFloat(action.value);
          return { ...g, adjustment: { ...adjustment, amount: Number.isNaN(v) ? 0 : v } };
        }
        return { ...g, adjustment: { ...adjustment, label: action.value } };
      });
      return { ...state, groups };
    }
    // ─── Services (02 服務說明摘要) ─────────────────────────────────────────
    case 'UPDATE_SERVICE': {
      const services = state.services.map((s) =>
        s.sub_group === action.sub_group ? { ...s, ...action.patch } : s,
      );
      if (services.every((s, i) => s === state.services[i])) return state;
      return { ...state, services };
    }
    // ─── Deliverables (string list) ──────────────────────────────────────
    case 'ADD_DELIVERABLE':
      return { ...state, deliverables: [...state.deliverables, action.value ?? ''] };
    case 'UPDATE_DELIVERABLE': {
      if (state.deliverables[action.index] === action.value) return state;
      const next = state.deliverables.slice();
      next[action.index] = action.value;
      return { ...state, deliverables: next };
    }
    case 'REMOVE_DELIVERABLE': {
      if (action.index < 0 || action.index >= state.deliverables.length) return state;
      return {
        ...state,
        deliverables: state.deliverables.filter((_, i) => i !== action.index),
      };
    }
    // ─── Notes (string list) ─────────────────────────────────────────────
    case 'ADD_NOTE':
      return { ...state, notes: [...state.notes, action.value ?? ''] };
    case 'UPDATE_NOTE': {
      if (state.notes[action.index] === action.value) return state;
      const next = state.notes.slice();
      next[action.index] = action.value;
      return { ...state, notes: next };
    }
    case 'REMOVE_NOTE': {
      if (action.index < 0 || action.index >= state.notes.length) return state;
      return { ...state, notes: state.notes.filter((_, i) => i !== action.index) };
    }
    // ─── Payment (object) ────────────────────────────────────────────────
    case 'SET_PAYMENT': {
      if (state.payment[action.field] === action.value) return state;
      return { ...state, payment: { ...state.payment, [action.field]: action.value } };
    }
    case 'RESET':
      return action.quote;
    case 'LOAD':
      // Re-derive services from the loaded items (preserves any saved
      // summary / includeAppendix) so 02 + appendix render on open.
      return reSyncServices(action.quote);
    default: {
      // Exhaustive check — TS will error if a new action type is added without a case.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
