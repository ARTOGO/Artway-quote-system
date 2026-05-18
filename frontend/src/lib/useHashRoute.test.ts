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

  it('falls back to builder when quote_no has malformed percent encoding', () => {
    // decodeURIComponent throws URIError on incomplete / invalid percent
    // escapes. Reviewer flagged (Gemini #3257443997 + Codex #3257453832 P1):
    // pasted bookmarks or truncated URLs must not crash the app.
    expect(parseHash('#/quote/%E0%A4%A')).toEqual({ name: 'builder' }); // truncated UTF-8 sequence
    expect(parseHash('#/quote/%')).toEqual({ name: 'builder' }); // lone percent
    expect(parseHash('#/quote/%ZZ')).toEqual({ name: 'builder' }); // non-hex after %
    expect(parseHash('#/quote/abc%')).toEqual({ name: 'builder' }); // trailing %
  });
});
