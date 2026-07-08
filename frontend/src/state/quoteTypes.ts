// Quote domain types.
//
// Mirrors the legacy `state` object (legacy.html line 2086-2099) but adds
// TypeScript discipline. PR 4 Session 1 only wires meta / client / sales;
// groups / services / etc are stubbed with empty arrays and populated in
// later sessions.

// 'template' 是業務端的偽狀態:標記此筆為「常用模板」,歷史頁會置頂並用實體
// 金色 pill 突顯,方便從歷史頁一鍵複製使用。後端 CHECK constraint 見
// migrations/0002_add_template_status.sql。
export type QuoteStatus = 'draft' | 'sent' | 'signed' | 'executed' | 'template';

export interface QuoteMeta {
  title: string;
  quoteNo: string;
  issueDate: string; // ISO yyyy-mm-dd
  validUntil: string; // ISO yyyy-mm-dd
}

export interface QuoteClient {
  company: string;
  contactName: string;
  contactTitle: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
}

export interface QuoteClientSig {
  sameAsClient: boolean;
  name: string;
  title: string;
}

export interface QuoteSales {
  name: string;
  title: string;
  phone: string;
  email: string;
}

export interface QuoteItem {
  id: string; // stable React key + reorder anchor
  sub_group: string; // Category column (e.g. A-1, B-2, or free text in manual)
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  priceTier?: string;
  /**
   * Per-item discount (NTD). Surfaced only when the parent group's
   * `hasDiscount` is on. `calcItemAmount` subtracts it from qty×unitPrice.
   * Legacy `it.discount` (legacy.html line 2865).
   */
  discount?: number;
  /**
   * Catalog service description (sheet "D 欄") carried onto the item so the
   * 02 服務說明摘要 + appendix derivation doesn't need the catalog at render
   * time and survives save/load. Empty / undefined for manual items.
   */
  service_description?: string;
  /** True for manually-entered items (no catalog repick affordance). */
  isManual?: boolean;
  /**
   * Catalog list / arts prices carried onto the item (legacy `_priceStandard`
   * / `_priceArts`). Used by the auto-discount toggle to compute
   * discount = max(0, priceStandard − priceArts). Undefined for manual items.
   */
  priceStandard?: number;
  priceArts?: number;
}

export interface QuoteAdjustment {
  label: string;
  amount: number; // NTD; negative = 扣款 (議價折讓), positive = 加收 (手續費)
}

export interface QuoteGroup {
  id: string;
  /**
   * Immutable group sequence number — drives default title "A-<seq>". Stays
   * stable when the user renames the title, so subsequent + 新增組 calls
   * never collide on `A-1` even if the first group's `A-1` prefix was
   * removed. Mirrors legacy `nextGroupNum` counter (legacy.html line 2560).
   * Reviewer (Codex C2).
   */
  seq: number;
  title: string;
  items: QuoteItem[];
  /** Show the per-item Discount column (legacy `g.hasDiscount`). */
  hasDiscount?: boolean;
  /** Auto-fill each item's discount = max(0, price_standard − price_arts). */
  autoDiscount?: boolean;
  /** Show the final 議價/手續費 adjustment row (legacy `g.hasAdjustment`). */
  hasAdjustment?: boolean;
  /** Adjustment label + amount (legacy `g.adjustment`). */
  adjustment?: QuoteAdjustment;
}

/**
 * Derived per-sub_group service entry (legacy `state.services[]`). Built from
 * the items present in `groups` (syncServices), with user-editable `summary`
 * + `includeAppendix` preserved across re-syncs.
 */
export interface QuoteService {
  sub_group: string;
  summary: string; // user-editable extra summary text
  service_description: string; // from catalog; drives appendix sections
  hasAppendix: boolean; // true when service_description is non-empty
  includeAppendix: boolean; // user toggle: show 「請見附件」 + appendix page
}

export interface QuotePayment {
  terms: string;
  currency: string;
  method: string;
  deliveryNote: string;
}

export interface Quote {
  id: string | null;
  status: QuoteStatus;
  meta: QuoteMeta;
  client: QuoteClient;
  clientSig: QuoteClientSig;
  sales: QuoteSales;
  groups: QuoteGroup[];
  deliverables: string[];
  services: QuoteService[];
  notes: string[];
  payment: QuotePayment;
}

// ─── Action union (consumed by quoteReducer) ──────────────────────────────

export type QuoteAction =
  | { type: 'SET_STATUS'; status: QuoteStatus }
  | { type: 'SET_QUOTE_NO'; quoteNo: string }
  | { type: 'SET_SAVED'; id: string; forQuoteNo: string; quoteNo?: string }
  | { type: 'SET_META'; field: keyof QuoteMeta; value: string }
  | { type: 'SET_CLIENT'; field: keyof QuoteClient; value: string }
  | { type: 'SET_SALES'; field: keyof QuoteSales; value: string }
  // ─── Groups ────────────────────────────────────────────────────────────
  | { type: 'ADD_GROUP'; group: QuoteGroup }
  | { type: 'REMOVE_GROUP'; gid: string }
  | { type: 'RENAME_GROUP'; gid: string; title: string }
  | { type: 'ADD_ITEM'; gid: string; item: QuoteItem }
  | { type: 'REMOVE_ITEM'; gid: string; itemId: string }
  | {
      type: 'UPDATE_ITEM';
      gid: string;
      itemId: string;
      patch: Partial<Omit<QuoteItem, 'id'>>;
    }
  | { type: 'MOVE_ITEM'; gid: string; fromIndex: number; toIndex: number }
  // ─── Group discount / adjustment (Session 2.5) ─────────────────────────
  | { type: 'SET_GROUP_DISCOUNT'; gid: string; hasDiscount: boolean }
  | { type: 'SET_GROUP_AUTO_DISCOUNT'; gid: string; autoDiscount: boolean }
  | { type: 'SET_GROUP_ADJUSTMENT_ENABLED'; gid: string; hasAdjustment: boolean }
  | { type: 'SET_GROUP_ADJUSTMENT'; gid: string; field: keyof QuoteAdjustment; value: string }
  // ─── Services (02 服務說明摘要) ─────────────────────────────────────────
  | {
      type: 'UPDATE_SERVICE';
      sub_group: string;
      patch: Partial<Pick<QuoteService, 'summary' | 'includeAppendix'>>;
    }
  // ─── Deliverables / Notes / Payment (Session 3) ────────────────────────
  | { type: 'ADD_DELIVERABLE'; value?: string }
  | { type: 'UPDATE_DELIVERABLE'; index: number; value: string }
  | { type: 'REMOVE_DELIVERABLE'; index: number }
  | { type: 'ADD_NOTE'; value?: string }
  | { type: 'UPDATE_NOTE'; index: number; value: string }
  | { type: 'REMOVE_NOTE'; index: number }
  | { type: 'SET_PAYMENT'; field: keyof QuotePayment; value: string }
  | { type: 'RESET'; quote: Quote }
  | { type: 'LOAD'; quote: Quote };

// ─── Constants ────────────────────────────────────────────────────────────

export const STATUS_OPTIONS: ReadonlyArray<{
  value: QuoteStatus;
  label: string;
  color: string;
}> = [
  { value: 'draft', label: '草稿', color: '#9A8B7A' },
  { value: 'sent', label: '已送出', color: '#BA9972' },
  { value: 'signed', label: '已簽回', color: '#7AA88C' },
  { value: 'executed', label: '已執行', color: '#6FA0C9' },
  // 模板 pill 是實體金色,不是外框 — 走 History.module.scss 的 data-status='template' 樣式。
  { value: 'template', label: '模板 (複製使用)', color: '#BA9972' },
];
