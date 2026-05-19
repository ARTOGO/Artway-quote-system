// Quote reducer — pure function, easy to unit-test.
//
// Replaces the legacy global `state` mutation + manual re-render pattern
// (legacy.html line 2086 + 2670+). React + useReducer gives us:
//   1) immutable snapshots → DevTools time-travel + React.memo works
//   2) typed actions → compiler catches misspelled fields
//   3) testable transitions → see quoteReducer.test.ts

import { addDaysISO, todayISO } from '../lib/dates';
import type { Quote, QuoteAction, QuoteStatus } from './quoteTypes';

/**
 * Build a blank quote with sensible defaults. The legacy app applied these
 * defaults inline (`payment.currency = '新台幣 NTD'`, `sales.phone =
 * '02-7752-8899'`); centralising them here means new quotes load uniformly
 * regardless of caller.
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
    sales: { name: '', title: '', phone: '02-7752-8899', email: '' },
    groups: [],
    deliverables: [],
    services: [],
    notes: [],
    payment: {
      terms: '',
      currency: '新台幣 NTD',
      method: '銀行轉帳',
      deliveryNote: '',
    },
  };
}

const VALID_STATUSES: readonly QuoteStatus[] = ['draft', 'sent', 'signed', 'executed'];

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
    case 'RESET':
      return action.quote;
    case 'LOAD':
      return action.quote;
    default: {
      // Exhaustive check — TS will error if a new action type is added without a case.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
