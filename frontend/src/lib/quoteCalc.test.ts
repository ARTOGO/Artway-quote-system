import { describe, expect, it } from 'vitest';

import {
  calcGrandTotal,
  calcGroupSubtotal,
  calcGroupTax,
  calcGroupTotal,
  calcItemAmount,
  displaySubGroup,
  formatMoney,
} from './quoteCalc';
import type { QuoteGroup, QuoteItem } from '../state/quoteTypes';

function item(qty: number, unitPrice: number, overrides: Partial<QuoteItem> = {}): QuoteItem {
  return {
    id: 'i_' + Math.random().toString(36).slice(2),
    sub_group: '',
    name: 'item',
    unit: '',
    qty,
    unitPrice,
    ...overrides,
  };
}

function group(items: QuoteItem[]): QuoteGroup {
  return { id: 'g_' + Math.random().toString(36).slice(2), title: 'A-1', items };
}

describe('calcItemAmount', () => {
  it('returns qty * unitPrice', () => {
    expect(calcItemAmount({ qty: 3, unitPrice: 1000 })).toBe(3000);
    expect(calcItemAmount({ qty: 1, unitPrice: 12345 })).toBe(12345);
  });

  it('treats NaN / negative as 0', () => {
    expect(calcItemAmount({ qty: 0, unitPrice: 1000 })).toBe(0);
    expect(calcItemAmount({ qty: -1, unitPrice: 1000 })).toBe(0);
    expect(calcItemAmount({ qty: 3, unitPrice: -100 })).toBe(0);
    expect(calcItemAmount({ qty: Number.NaN as unknown as number, unitPrice: 100 })).toBe(0);
  });
});

describe('calcGroupSubtotal', () => {
  it('sums every item amount', () => {
    const g = group([item(2, 500), item(1, 1000), item(3, 100)]);
    expect(calcGroupSubtotal(g)).toBe(1000 + 1000 + 300);
  });

  it('returns 0 for empty group', () => {
    expect(calcGroupSubtotal(group([]))).toBe(0);
  });
});

describe('calcGroupTax', () => {
  it('returns round(subtotal * 0.05) — legacy NTD integer', () => {
    expect(calcGroupTax(10000)).toBe(500);
    expect(calcGroupTax(1234)).toBe(62); // 61.7 → 62
    expect(calcGroupTax(0)).toBe(0);
  });
});

describe('calcGroupTotal', () => {
  it('subtotal + tax', () => {
    const g = group([item(2, 1000)]); // subtotal 2000, tax 100, total 2100
    expect(calcGroupTotal(g)).toBe(2100);
  });
});

describe('calcGrandTotal', () => {
  it('sums totals across all groups', () => {
    const a = group([item(1, 1000)]); // 1000 + 50 = 1050
    const b = group([item(2, 2000)]); // 4000 + 200 = 4200
    expect(calcGrandTotal([a, b])).toBe(1050 + 4200);
  });

  it('handles empty groups array', () => {
    expect(calcGrandTotal([])).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats integers with US thousands grouping (legacy)', () => {
    expect(formatMoney(0)).toBe('0');
    expect(formatMoney(1000)).toBe('1,000');
    expect(formatMoney(1234567)).toBe('1,234,567');
  });

  it('returns em-dash for non-numeric input (legacy contract)', () => {
    expect(formatMoney(Number.NaN)).toBe('—');
    // typescript prevents string passthrough but legacy callers passed mixed
    expect(formatMoney(NaN)).toBe('—');
  });
});

describe('displaySubGroup', () => {
  it('strips `[A-Z]-<n>_` prefix and trims', () => {
    expect(displaySubGroup('A-1_實境展間2.0')).toBe('實境展間2.0');
    expect(displaySubGroup('B-12_主機代管')).toBe('主機代管');
    expect(displaySubGroup('C-3-平面設計')).toBe('平面設計');
  });

  it('returns the original string when stripping would empty it (e.g. just "A-1")', () => {
    // Legacy fallback: cleaned === '' → return original (so picker fixtures
    // using `A-1` as sub_group still render that code in preview).
    expect(displaySubGroup('A-1')).toBe('A-1');
    expect(displaySubGroup('B-12_')).toBe('B-12_');
  });

  it('returns empty string for empty input', () => {
    expect(displaySubGroup('')).toBe('');
  });

  it('leaves arbitrary text untouched when prefix does not match', () => {
    expect(displaySubGroup('客製化')).toBe('客製化');
    expect(displaySubGroup('Free-form')).toBe('Free-form');
  });
});
