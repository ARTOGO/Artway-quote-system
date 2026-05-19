// Quote calculation primitives — pure functions, easy to unit-test.
//
// Mirrors legacy `calcItemAmount` (line 2863) + `renderGroups` subtotal/tax
// logic (line 2229-2233). Money values are integer NTD (no fractional cents)
// to match legacy `formatMoney` behaviour.

import type { QuoteGroup, QuoteItem } from '../state/quoteTypes';

const TAX_RATE = 0.05; // 5% 營業稅 (Session 2 fixed rate, configurable later)

/**
 * Single item amount: qty × unitPrice. Negative values default to 0
 * (legacy `Number(...) || 0` semantics).
 *
 * Session 2 skips the optional `discount` column (legacy parameter
 * `hasDiscount`). That branch lands when Session 2.5 / PR 5 adds the
 * Discount toggle UI.
 */
export function calcItemAmount(item: Pick<QuoteItem, 'qty' | 'unitPrice'>): number {
  const qty = Number(item.qty) || 0;
  const price = Number(item.unitPrice) || 0;
  return Math.max(0, qty) * Math.max(0, price);
}

/** Sum of all item amounts in a group (the 小計 Subtotal row). */
export function calcGroupSubtotal(group: Pick<QuoteGroup, 'items'>): number {
  return group.items.reduce((acc, it) => acc + calcItemAmount(it), 0);
}

/**
 * Tax on subtotal, rounded to integer NTD (legacy `Math.round(... * 0.05)`).
 */
export function calcGroupTax(subtotal: number): number {
  return Math.round(subtotal * TAX_RATE);
}

/** Group grand total — subtotal + tax (no adjustment yet, Session 2.5). */
export function calcGroupTotal(group: Pick<QuoteGroup, 'items'>): number {
  const subtotal = calcGroupSubtotal(group);
  return subtotal + calcGroupTax(subtotal);
}

/** Sum of all groups' totals — the document grand total. */
export function calcGrandTotal(groups: ReadonlyArray<Pick<QuoteGroup, 'items'>>): number {
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
