import { afterEach, describe, expect, it, vi } from 'vitest';

import { navigate, parseHash } from './useHashRoute';

describe('navigate', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('pushes a new entry by default (sets location.hash)', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    navigate('/history');
    expect(window.location.hash).toBe('#/history');
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('replaces the current entry (no push) and notifies subscribers when replace:true', () => {
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    let hashChangeFired = false;
    const onHash = (): void => {
      hashChangeFired = true;
    };
    window.addEventListener('hashchange', onHash);
    navigate('/', { replace: true });
    window.removeEventListener('hashchange', onHash);

    expect(replaceSpy).toHaveBeenCalledWith(null, '', '#/');
    expect(window.location.hash).toBe('#/');
    expect(hashChangeFired).toBe(true); // replaceState doesn't fire it; we dispatch
  });
});

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
      autoprint: false,
    });
  });

  it('decodes URI-encoded quote_no', () => {
    // 業務有時 paste 帶 URL-encoded space
    expect(parseHash('#/quote/AW-260516-001%20special')).toEqual({
      name: 'quote-detail',
      quoteNo: 'AW-260516-001 special',
      autoprint: false,
    });
  });

  it('falls back to builder for unknown route', () => {
    expect(parseHash('#/unknown')).toEqual({ name: 'builder' });
    expect(parseHash('#/quote')).toEqual({ name: 'builder' }); // missing quote_no
  });

  it('strips unrecognised query params but preserves autoprint=1', () => {
    // Unknown query keys on history are still ignored.
    expect(parseHash('#/history?foo=1&bar=baz')).toEqual({ name: 'history' });
    // Unknown query keys on quote-detail don't set autoprint.
    expect(parseHash('#/quote/AW-1?force=1')).toEqual({
      name: 'quote-detail',
      quoteNo: 'AW-1',
      autoprint: false,
    });
    // autoprint=1 is the History → 快捷輸出 PDF 使用的旗標。
    expect(parseHash('#/quote/AW-1?autoprint=1')).toEqual({
      name: 'quote-detail',
      quoteNo: 'AW-1',
      autoprint: true,
    });
    // Any other autoprint value is treated as falsy.
    expect(parseHash('#/quote/AW-1?autoprint=0')).toEqual({
      name: 'quote-detail',
      quoteNo: 'AW-1',
      autoprint: false,
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
