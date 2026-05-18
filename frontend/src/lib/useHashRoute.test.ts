import { describe, expect, it } from 'vitest';

import { parseHash } from './useHashRoute';

describe('parseHash', () => {
  it('returns builder for empty hash variants', () => {
    expect(parseHash('')).toEqual({ name: 'builder' });
    expect(parseHash('#')).toEqual({ name: 'builder' });
    expect(parseHash('#/')).toEqual({ name: 'builder' });
  });

  it('returns history for #/history', () => {
    expect(parseHash('#/history')).toEqual({ name: 'history' });
  });

  it('parses quote-detail with quote_no', () => {
    expect(parseHash('#/quote/AW-260516-001')).toEqual({
      name: 'quote-detail',
      quoteNo: 'AW-260516-001',
    });
  });

  it('decodes URI-encoded quote_no', () => {
    // 業務有時 paste 帶 URL-encoded space
    expect(parseHash('#/quote/AW-260516-001%20special')).toEqual({
      name: 'quote-detail',
      quoteNo: 'AW-260516-001 special',
    });
  });

  it('falls back to builder for unknown route', () => {
    expect(parseHash('#/unknown')).toEqual({ name: 'builder' });
    expect(parseHash('#/quote')).toEqual({ name: 'builder' }); // missing quote_no
  });

  it('strips query string', () => {
    expect(parseHash('#/history?foo=1&bar=baz')).toEqual({ name: 'history' });
    expect(parseHash('#/quote/AW-1?force=1')).toEqual({
      name: 'quote-detail',
      quoteNo: 'AW-1',
    });
  });

  it('handles missing leading slash gracefully', () => {
    // 防禦：書籤被截斷成 #history 也要 work
    expect(parseHash('#history')).toEqual({ name: 'history' });
    expect(parseHash('history')).toEqual({ name: 'history' });
  });
});
