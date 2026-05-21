import { describe, expect, it } from 'vitest';

import {
  ITEMS_CATALOG_FIXTURE,
  filterByGroup,
  itemsInSubGroup,
  listGroups,
  listSubGroups,
  searchItems,
} from './itemsCatalog';

describe('ITEMS_CATALOG_FIXTURE', () => {
  it('has ≥ 10 items', () => {
    expect(ITEMS_CATALOG_FIXTURE.length).toBeGreaterThanOrEqual(10);
  });

  it('every item has required fields populated', () => {
    for (const it of ITEMS_CATALOG_FIXTURE) {
      expect(it.group.length).toBeGreaterThan(0);
      // sub_group uses the "<code>_<名稱>" convention, e.g. "A-1_實境展間 2.0".
      expect(it.sub_group).toMatch(/^[A-Z]-\d+_/);
      expect(it.name.length).toBeGreaterThan(0);
      expect(it.unit.length).toBeGreaterThan(0);
      expect(it.price_standard).toBeGreaterThan(0);
      expect(it.price_arts).toBeGreaterThan(0);
      expect(it.price_arts).toBeLessThanOrEqual(it.price_standard);
    }
  });

  it('reproduces the real A展間系統 A-1~A-7 sub_groups', () => {
    const subs = listSubGroups('A展間系統');
    expect(subs).toHaveLength(7);
    expect(subs[0]).toMatch(/^A-1_/);
    expect(subs[6]).toMatch(/^A-7_/);
  });
});

describe('listGroups', () => {
  it('returns the 大品項 groups in catalog order', () => {
    expect(listGroups()).toEqual(['A展間系統', 'B網站系統', 'C設計系統', 'D專案系統']);
  });

  it('deduplicates from a custom catalog', () => {
    const custom = [
      {
        group: 'X',
        sub_group: 'X-1_a',
        name: '',
        unit: '',
        price_standard: 0,
        price_arts: 0,
        service_description: '',
      },
      {
        group: 'X',
        sub_group: 'X-2_b',
        name: '',
        unit: '',
        price_standard: 0,
        price_arts: 0,
        service_description: '',
      },
    ];
    expect(listGroups(custom)).toEqual(['X']);
  });
});

describe('listSubGroups / itemsInSubGroup (cascading picker)', () => {
  it('lists the sub_groups of a group in order', () => {
    expect(listSubGroups('B網站系統')).toEqual(['B-1_形象網站', 'B-2_主機代管']);
  });

  it('returns the items under a group + sub_group', () => {
    const items = itemsInSubGroup('A展間系統', 'A-1_實境展間 2.0');
    expect(items.length).toBe(2);
    expect(items.every((i) => i.sub_group === 'A-1_實境展間 2.0')).toBe(true);
    expect(items[0].name).toMatch(/標準型/);
  });

  it('returns [] for an unknown group/sub_group', () => {
    expect(itemsInSubGroup('Z', 'Z-9_x')).toEqual([]);
  });
});

describe('filterByGroup', () => {
  it('returns only items with matching group', () => {
    const a = filterByGroup('A展間系統');
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((it) => it.group === 'A展間系統')).toBe(true);
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
    expect(searchItems('標準型').length).toBeGreaterThan(0);
    expect(searchItems('one-page')).toEqual(searchItems('One-page'));
  });

  it('matches against sub_group', () => {
    const out = searchItems('A-1');
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((it) => it.sub_group.includes('A-1') || it.name.includes('A-1'))).toBe(true);
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
