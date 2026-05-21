import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearCatalogCache, fetchItemsCatalog, normalizeCatalog } from './items';

afterEach(() => {
  clearCatalogCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('normalizeCatalog', () => {
  it('returns [] for non-object / missing items', () => {
    expect(normalizeCatalog(null)).toEqual([]);
    expect(normalizeCatalog({})).toEqual([]);
    expect(normalizeCatalog({ items: 'nope' })).toEqual([]);
  });

  it('coerces comma-string prices to integer NTD', () => {
    const out = normalizeCatalog({
      items: [
        {
          group: 'A展間系統',
          sub_group: 'A-1_實境展間 2.0',
          name: '標準型',
          unit: '件',
          price_standard: '12,000',
          price_arts: ' 9,600 ',
          service_description: '【規格】\n720°',
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].price_standard).toBe(12000);
    expect(out[0].price_arts).toBe(9600);
    expect(out[0].group).toBe('A展間系統');
    // service_description keeps internal newlines (appendix parsing needs them)
    expect(out[0].service_description).toBe('【規格】\n720°');
  });

  it('defaults missing prices to 0 and trims strings', () => {
    const out = normalizeCatalog({
      items: [{ group: '  A  ', sub_group: 'A-1_x', name: ' n ', unit: '' }],
    });
    expect(out[0].group).toBe('A');
    expect(out[0].name).toBe('n');
    expect(out[0].price_standard).toBe(0);
    expect(out[0].price_arts).toBe(0);
  });

  it('drops fully-empty rows', () => {
    const out = normalizeCatalog({
      items: [
        { group: '', sub_group: '', name: '' },
        { group: 'A', sub_group: '', name: '' },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].group).toBe('A');
  });
});

describe('fetchItemsCatalog', () => {
  it('fetches, normalizes, and caches (one network call for repeat calls)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                group: 'A展間系統',
                sub_group: 'A-1_實境展間 2.0',
                name: '標準型',
                unit: '件',
                price_standard: 12000,
                price_arts: 9600,
              },
            ],
          }),
      } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchItemsCatalog();
    const second = await fetchItemsCatalog();
    expect(first).toHaveLength(1);
    expect(first[0].name).toBe('標準型');
    expect(second).toBe(first); // cached reference
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on an empty payload (caller falls back to fixture)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: [] }),
        } as unknown as Response),
      ),
    );
    await expect(fetchItemsCatalog()).rejects.toThrow(/empty/);
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 502 } as unknown as Response)),
    );
    await expect(fetchItemsCatalog()).rejects.toThrow(/502/);
  });
});
