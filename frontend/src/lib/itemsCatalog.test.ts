import { describe, expect, it } from 'vitest';

import { ITEMS_CATALOG_FIXTURE, filterByGroup, listGroups, searchItems } from './itemsCatalog';

describe('ITEMS_CATALOG_FIXTURE', () => {
  it('has ≥ 10 items', () => {
    expect(ITEMS_CATALOG_FIXTURE.length).toBeGreaterThanOrEqual(10);
  });

  it('every item has required fields populated', () => {
    for (const it of ITEMS_CATALOG_FIXTURE) {
      expect(it.group).toMatch(/^[A-Z]$/);
      expect(it.sub_group).toMatch(/^[A-Z]-\d+$/);
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.unit.length).toBeGreaterThan(0);
      expect(it.price_standard).toBeGreaterThan(0);
      expect(it.price_arts).toBeGreaterThan(0);
      expect(it.price_arts).toBeLessThanOrEqual(it.price_standard);
    }
  });
});

describe('listGroups', () => {
  it('returns unique sorted group letters', () => {
    expect(listGroups()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('deduplicates from a custom catalog', () => {
    const custom = [
      { group: 'X', sub_group: 'X-1', name: '', unit: '', price_standard: 0, price_arts: 0 },
      { group: 'X', sub_group: 'X-2', name: '', unit: '', price_standard: 0, price_arts: 0 },
    ];
    expect(listGroups(custom)).toEqual(['X']);
  });
});

describe('filterByGroup', () => {
  it('returns only items with matching group', () => {
    const a = filterByGroup('A');
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((it) => it.group === 'A')).toBe(true);
  });

  it('returns empty for unknown group', () => {
    expect(filterByGroup('Z')).toEqual([]);
  });
});

describe('searchItems', () => {
  it('empty query returns full catalog', () => {
    expect(searchItems('')).toHaveLength(ITEMS_CATALOG_FIXTURE.length);
    expect(searchItems('   ')).toHaveLength(ITEMS_CATALOG_FIXTURE.length);
  });

  it('matches against name (case-insensitive)', () => {
    expect(searchItems('立體').length).toBeGreaterThan(0);
    expect(searchItems('立體').every((it) => it.name.includes('立體'))).toBe(true);
    expect(searchItems('ar')).toEqual(searchItems('AR'));
  });

  it('matches against sub_group', () => {
    const out = searchItems('B-2');
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((it) => it.sub_group === 'B-2' || it.name.toLowerCase().includes('b-2'))).toBe(
      true,
    );
  });

  it('matches against unit', () => {
    const out = searchItems('場');
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((it) => it.unit === '場' || it.name.includes('場'))).toBe(true);
  });

  it('returns empty for no match', () => {
    expect(searchItems('zzzzzz_nothing')).toEqual([]);
  });
});
