import { describe, expect, it } from 'vitest';

import { parseAppendixSections, syncServices } from './services';
import type { QuoteGroup, QuoteService } from '../state/quoteTypes';

function group(id: string, items: QuoteGroup['items']): QuoteGroup {
  return { id, seq: 1, title: id, items };
}
function item(sub_group: string, service_description = ''): QuoteGroup['items'][number] {
  return {
    id: `i-${sub_group}-${Math.random()}`,
    sub_group,
    name: 'x',
    unit: '式',
    qty: 1,
    unitPrice: 0,
    service_description,
  };
}

describe('parseAppendixSections', () => {
  it('returns [] for empty / blank input', () => {
    expect(parseAppendixSections('')).toEqual([]);
    expect(parseAppendixSections('   \n  ')).toEqual([]);
  });

  it('splits 【title】 headers into sections with following bullets', () => {
    const out = parseAppendixSections('【拍攝規格】\n720° 環物\n含打光\n【交付物】\nembed 連結');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: '拍攝規格', bullets: ['720° 環物', '含打光'] });
    expect(out[1]).toEqual({ title: '交付物', bullets: ['embed 連結'] });
  });

  it('also accepts [bracket] headers and strips bullet markers', () => {
    const out = parseAppendixSections('[Scope]\n・ item one\n- item two\n• item three');
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Scope');
    expect(out[0].bullets).toEqual(['item one', 'item two', 'item three']);
  });

  it('captures leading bullets with no preceding header (title empty)', () => {
    const out = parseAppendixSections('just a line\nanother');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ title: '', bullets: ['just a line', 'another'] });
  });
});

describe('syncServices', () => {
  it('derives one entry per distinct sub_group in first-seen order', () => {
    const groups = [group('g1', [item('A-1'), item('B-1'), item('A-1')])];
    const out = syncServices(groups, []);
    expect(out.map((s) => s.sub_group)).toEqual(['A-1', 'B-1']);
  });

  it('marks hasAppendix true only when a service_description exists', () => {
    const groups = [group('g1', [item('A-1', '【x】\nbullet'), item('B-2', '')])];
    const out = syncServices(groups, []);
    const a1 = out.find((s) => s.sub_group === 'A-1')!;
    const b2 = out.find((s) => s.sub_group === 'B-2')!;
    expect(a1.hasAppendix).toBe(true);
    expect(a1.service_description).toContain('bullet');
    expect(b2.hasAppendix).toBe(false);
  });

  it('preserves user summary + includeAppendix across re-sync', () => {
    const groups = [group('g1', [item('A-1', '【x】\ny')])];
    const prev: QuoteService[] = [
      {
        sub_group: 'A-1',
        summary: 'my note',
        service_description: '【x】\ny',
        hasAppendix: true,
        includeAppendix: false,
      },
    ];
    const out = syncServices(groups, prev);
    expect(out[0].summary).toBe('my note');
    expect(out[0].includeAppendix).toBe(false);
  });

  it('defaults includeAppendix to true for newly-seen sub_groups', () => {
    const out = syncServices([group('g1', [item('A-1', '【x】\ny')])], []);
    expect(out[0].includeAppendix).toBe(true);
  });

  it('falls back to prev service_description when items carry none (Codex P2 #2)', () => {
    // Loaded/legacy quote: items have NO per-item service_description, but the
    // previously-synced services array does → must NOT be wiped on re-sync.
    const groups = [group('g1', [item('A-1', '')])];
    const prev: QuoteService[] = [
      {
        sub_group: 'A-1',
        summary: '',
        service_description: '【拍攝】\n720°',
        hasAppendix: true,
        includeAppendix: true,
      },
    ];
    const out = syncServices(groups, prev);
    expect(out[0].service_description).toBe('【拍攝】\n720°');
    expect(out[0].hasAppendix).toBe(true);
  });

  it('drops services whose sub_group no longer has any items', () => {
    const prev: QuoteService[] = [
      {
        sub_group: 'GONE',
        summary: 's',
        service_description: '',
        hasAppendix: false,
        includeAppendix: true,
      },
    ];
    const out = syncServices([group('g1', [item('A-1')])], prev);
    expect(out.map((s) => s.sub_group)).toEqual(['A-1']);
  });
});
