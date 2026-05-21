// Quote calculation primitives — pure functions, easy to unit-test.
//
// Mirrors legacy `calcItemAmount` (line 2863) + `renderGroups` subtotal/tax
// logic (line 2229-2233). Money values are integer NTD (no fractional cents)
// to match legacy `formatMoney` behaviour.

import type { QuoteGroup, QuoteItem } from '../state/quoteTypes';

const TAX_RATE = 0.05; // 5% 營業稅 (Session 2 fixed rate, configurable later)

/**
 * Single item amount: qty × unitPrice − discount. Legacy
 * `calcItemAmount(it, hasDiscount)` (line 2863): the discount is only
 * applied when the parent group's Discount column is on (`hasDiscount`).
 *
 * Reviewer (Gemini G2): fractional qty (0.5 day, 1.5 場) × price can produce
 * decimals; we round the qty×price base to integer NTD so subtotal / tax /
 * grand total stay integer-aligned. Discount is an integer NTD value and is
 * subtracted after rounding (legacy `base − disc`, which may go negative).
 */
export function calcItemAmount(
  item: Pick<QuoteItem, 'qty' | 'unitPrice' | 'discount'>,
  hasDiscount = false,
): number {
  const qty = Number(item.qty) || 0;
  const price = Number(item.unitPrice) || 0;
  const base = Math.round(Math.max(0, qty) * Math.max(0, price));
  const disc = hasDiscount ? Number(item.discount) || 0 : 0;
  return base - disc;
}

/** Sum of all item amounts in a group (the 小計 Subtotal row). */
export function calcGroupSubtotal(group: Pick<QuoteGroup, 'items' | 'hasDiscount'>): number {
  return group.items.reduce((acc, it) => acc + calcItemAmount(it, group.hasDiscount), 0);
}

/**
 * Tax on subtotal, rounded to integer NTD (legacy `Math.round(... * 0.05)`).
 */
export function calcGroupTax(subtotal: number): number {
  return Math.round(subtotal * TAX_RATE);
}

/**
 * The active adjustment amount for a group — 0 unless the 議價/手續費 row is
 * enabled with a valid numeric amount (legacy line 2231). Negative = 扣款.
 */
export function calcGroupAdjustment(
  group: Pick<QuoteGroup, 'hasAdjustment' | 'adjustment'>,
): number {
  if (!group.hasAdjustment || !group.adjustment) return 0;
  const amt = Number(group.adjustment.amount);
  return Number.isNaN(amt) ? 0 : amt;
}

/**
 * Group grand total — subtotal + tax + adjustment (legacy line 2233:
 * `grand = subtotal + tax + adjAmt`).
 */
export function calcGroupTotal(
  group: Pick<QuoteGroup, 'items' | 'hasDiscount' | 'hasAdjustment' | 'adjustment'>,
): number {
  const subtotal = calcGroupSubtotal(group);
  return subtotal + calcGroupTax(subtotal) + calcGroupAdjustment(group);
}

/** Sum of all groups' totals — the document grand total. */
export function calcGrandTotal(
  groups: ReadonlyArray<Pick<QuoteGroup, 'items' | 'hasDiscount' | 'hasAdjustment' | 'adjustment'>>,
): number {
  return groups.reduce((acc, g) => acc + calcGroupTotal(g), 0);
}

/**
 * `1,234,567` style money string. Legacy `formatMoney` returns `'—'` for
 * non-numeric input; we keep that contract for preview cells.
 */
export function formatMoney(n: number): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

/**
 * Strip leading `[A-Z]-<digits>[_-]?` from a sub_group string for
 * customer-facing display. Mirrors legacy `displaySubGroup` (legacy.html
 * line 2306-2310): the internal code (`A-1_`) is bookkeeping only — the
 * preview shows just the descriptive tail. Falls back to the original
 * string when stripping would yield empty (e.g. `sub_group === 'A-1'`).
 */
export function displaySubGroup(sg: string): string {
  if (!sg) return '';
  const s = String(sg).trim();
  const cleaned = s.replace(/^[A-Z]-\d+[_-]?/, '').trim();
  return cleaned || s;
}

/**
 * Strip a single leading slash from a unit string for customer-facing display.
 * Sheet rows carry units with the convention `/式`, `/場`, `/年`; the preview
 * shows the bare unit (`式`, `場`, `年`). Mirrors legacy `stripUnitSlash`
 * (legacy.html line 2525-2527): `String(unit||'').replace(/^\//, '')`. Only the
 * first leading slash is removed — an interior slash (`場/天`) is preserved.
 */
export function stripUnitSlash(unit: string): string {
  return String(unit || '').replace(/^\//, '');
}
