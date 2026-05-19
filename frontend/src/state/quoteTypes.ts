// Quote domain types.
//
// Mirrors the legacy `state` object (legacy.html line 2086-2099) but adds
// TypeScript discipline. PR 4 Session 1 only wires meta / client / sales;
// groups / services / etc are stubbed with empty arrays and populated in
// later sessions.

export type QuoteStatus = 'draft' | 'sent' | 'signed' | 'executed';

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
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
  priceTier?: string;
}

export interface QuoteGroup {
  id: string;
  title: string;
  items: QuoteItem[];
}

export interface QuoteService {
  code: string;
  name: string;
  bullets: string[];
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
  | { type: 'SET_META'; field: keyof QuoteMeta; value: string }
  | { type: 'SET_CLIENT'; field: keyof QuoteClient; value: string }
  | { type: 'SET_SALES'; field: keyof QuoteSales; value: string }
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
];
