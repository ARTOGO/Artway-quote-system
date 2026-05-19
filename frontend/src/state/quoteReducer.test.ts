import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBlankQuote, quoteReducer } from './quoteReducer';
import type { Quote } from './quoteTypes';

describe('createBlankQuote', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 18));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns id=null and status=draft', () => {
    const q = createBlankQuote();
    expect(q.id).toBeNull();
    expect(q.status).toBe('draft');
  });

  it('sets issueDate=today, validUntil=today+15 (legacy parity)', () => {
    const q = createBlankQuote();
    expect(q.meta.issueDate).toBe('2026-05-18');
    expect(q.meta.validUntil).toBe('2026-06-02');
  });

  it('seeds default sales phone (02-7752-8899) and payment currency', () => {
    const q = createBlankQuote();
    expect(q.sales.phone).toBe('02-7752-8899');
    expect(q.payment.currency).toBe('新台幣 NTD');
    expect(q.payment.method).toBe('銀行轉帳');
  });

  it('clientSig defaults to sameAsClient=true', () => {
    const q = createBlankQuote();
    expect(q.clientSig.sameAsClient).toBe(true);
  });

  it('returns independent instances (no shared references between calls)', () => {
    const a = createBlankQuote();
    const b = createBlankQuote();
    expect(a).not.toBe(b);
    expect(a.client).not.toBe(b.client);
    expect(a.groups).not.toBe(b.groups);
  });
});

describe('quoteReducer', () => {
  let initial: Quote;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 18));
    initial = createBlankQuote();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('SET_STATUS updates status and returns new reference', () => {
    const next = quoteReducer(initial, { type: 'SET_STATUS', status: 'sent' });
    expect(next.status).toBe('sent');
    expect(next).not.toBe(initial);
  });

  it('SET_STATUS no-op returns the same reference (===)', () => {
    const next = quoteReducer(initial, { type: 'SET_STATUS', status: 'draft' });
    expect(next).toBe(initial);
  });

  it('SET_QUOTE_NO updates meta.quoteNo', () => {
    const next = quoteReducer(initial, { type: 'SET_QUOTE_NO', quoteNo: 'AW-260518-001' });
    expect(next.meta.quoteNo).toBe('AW-260518-001');
    expect(next.meta).not.toBe(initial.meta);
  });

  it('SET_META updates a single field without touching siblings', () => {
    const next = quoteReducer(initial, {
      type: 'SET_META',
      field: 'title',
      value: '台當代展覽報價',
    });
    expect(next.meta.title).toBe('台當代展覽報價');
    expect(next.meta.issueDate).toBe(initial.meta.issueDate);
    expect(next.client).toBe(initial.client); // untouched branch keeps reference
  });

  it('SET_CLIENT updates a single field without touching siblings', () => {
    const next = quoteReducer(initial, {
      type: 'SET_CLIENT',
      field: 'company',
      value: '台灣當代藝術館',
    });
    expect(next.client.company).toBe('台灣當代藝術館');
    expect(next.client.contactName).toBe('');
    expect(next.meta).toBe(initial.meta);
  });

  it('SET_SALES updates a single field', () => {
    const next = quoteReducer(initial, { type: 'SET_SALES', field: 'name', value: 'Peter' });
    expect(next.sales.name).toBe('Peter');
    expect(next.sales.phone).toBe('02-7752-8899'); // default unchanged
  });

  it('returns the same state when setting an identical value (no-op)', () => {
    const next = quoteReducer(initial, { type: 'SET_META', field: 'title', value: '' });
    expect(next).toBe(initial);
  });

  it('RESET replaces the entire state with the provided quote', () => {
    const blank = createBlankQuote();
    const modified: Quote = { ...blank, meta: { ...blank.meta, title: 'X' } };
    const next = quoteReducer(modified, { type: 'RESET', quote: blank });
    expect(next).toBe(blank);
  });

  it('LOAD replaces the entire state (mirror of RESET — separate type for intent)', () => {
    const loaded: Quote = { ...createBlankQuote(), id: 'uuid-1', status: 'signed' };
    const next = quoteReducer(initial, { type: 'LOAD', quote: loaded });
    expect(next).toBe(loaded);
    expect(next.id).toBe('uuid-1');
    expect(next.status).toBe('signed');
  });
});
