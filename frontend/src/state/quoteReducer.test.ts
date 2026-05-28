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

  it('seeds default sales phone (02-2578-8901) and payment currency', () => {
    const q = createBlankQuote();
    expect(q.sales.phone).toBe('02-2578-8901');
    expect(q.payment.currency).toBe('新台幣 NTD');
    expect(q.payment.method).toBe('銀行轉帳');
  });

  it('seeds default payment terms / delivery note (legacy parity)', () => {
    const q = createBlankQuote();
    expect(q.payment.terms).toBe('簽約時 50%\n驗收時 50%');
    expect(q.payment.deliveryNote).toBe('收款後 6 個工作週');
  });

  it('seeds the 3 default disclaimer notes (legacy parity)', () => {
    const q = createBlankQuote();
    expect(q.notes).toHaveLength(3);
    expect(q.notes[0]).toContain('歡迎與本報價單聯繫窗口');
    expect(q.notes[2]).toContain('回簽視同正式訂單');
  });

  it('returns an independent notes array (mutating one quote does not leak)', () => {
    const a = createBlankQuote();
    const b = createBlankQuote();
    a.notes.push('mutated');
    expect(b.notes).toHaveLength(3);
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

  it('seeds one starter group A-1 with a unique id (legacy newQuote parity)', () => {
    const q = createBlankQuote();
    expect(q.groups).toHaveLength(1);
    expect(q.groups[0].seq).toBe(1);
    expect(q.groups[0].title).toMatch(/^A-1．/);
    expect(q.groups[0].items).toEqual([]);
    // Distinct id per quote so two blanks never collide.
    expect(createBlankQuote().groups[0].id).not.toBe(q.groups[0].id);
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

  it('SET_SAVED stamps the backend id when forQuoteNo matches the current quote', () => {
    expect(initial.id).toBeNull();
    const next = quoteReducer(initial, {
      type: 'SET_SAVED',
      id: 'uuid-1',
      forQuoteNo: initial.meta.quoteNo,
    });
    expect(next.id).toBe('uuid-1');
  });

  it('SET_SAVED is dropped if the quote was switched mid-save (forQuoteNo mismatch, Codex P1)', () => {
    // A stale create completion must NOT stamp its id onto a different quote,
    // or the next save would PUT the wrong row and overwrite it.
    const next = quoteReducer(initial, {
      type: 'SET_SAVED',
      id: 'uuid-1',
      forQuoteNo: 'AW-SOMETHING-ELSE',
    });
    expect(next).toBe(initial);
    expect(next.id).toBeNull();
  });

  it('SET_SAVED no-op returns the same reference when id unchanged (===)', () => {
    const saved = quoteReducer(initial, {
      type: 'SET_SAVED',
      id: 'uuid-1',
      forQuoteNo: initial.meta.quoteNo,
    });
    const again = quoteReducer(saved, {
      type: 'SET_SAVED',
      id: 'uuid-1',
      forQuoteNo: initial.meta.quoteNo,
    });
    expect(again).toBe(saved);
  });

  it('SET_SAVED stamps both id and the server-allocated quoteNo (Option B: number assigned at save)', () => {
    // A brand-new quote has quoteNo='' until it's first saved; the create
    // response carries the backend-allocated serial, which SET_SAVED stamps
    // into meta so the preview / PDF show it immediately.
    expect(initial.meta.quoteNo).toBe('');
    const next = quoteReducer(initial, {
      type: 'SET_SAVED',
      id: 'uuid-1',
      forQuoteNo: '', // matches the blank quote's current (empty) number
      quoteNo: 'AW-260518-001', // backend-allocated at save time
    });
    expect(next.id).toBe('uuid-1');
    expect(next.meta.quoteNo).toBe('AW-260518-001');
    expect(next.meta).not.toBe(initial.meta); // fresh meta object
  });

  it('SET_SAVED on an UPDATE (no quoteNo in action) leaves meta.quoteNo untouched', () => {
    // PUT-updates of an already-saved quote don't re-allocate; the action
    // omits quoteNo, so the existing number must be preserved unchanged.
    const seeded: Quote = { ...initial, meta: { ...initial.meta, quoteNo: 'AW-260101-042' } };
    const next = quoteReducer(seeded, {
      type: 'SET_SAVED',
      id: 'uuid-9',
      forQuoteNo: 'AW-260101-042',
    });
    expect(next.id).toBe('uuid-9');
    expect(next.meta.quoteNo).toBe('AW-260101-042');
    expect(next.meta).toBe(seeded.meta); // meta object reused (no quoteNo change)
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
    expect(next.sales.phone).toBe('02-2578-8901'); // default unchanged
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

  it('LOAD replaces state and re-derives services from the loaded items', () => {
    const loaded: Quote = { ...createBlankQuote(), id: 'uuid-1', status: 'signed' };
    const next = quoteReducer(initial, { type: 'LOAD', quote: loaded });
    // LOAD re-syncs services (legacy restore → renderServices), so it returns
    // a NEW object rather than the identical reference.
    expect(next).not.toBe(loaded);
    expect(next.id).toBe('uuid-1');
    expect(next.status).toBe('signed');
    // Loaded blank quote has a starter group with no items → no services.
    expect(next.services).toEqual([]);
  });

  // ─── Session 3: Deliverables / Notes / Payment ─────────────────────────

  describe('ADD_DELIVERABLE', () => {
    it('appends a new empty string by default', () => {
      const next = quoteReducer(initial, { type: 'ADD_DELIVERABLE' });
      expect(next.deliverables).toEqual(['']);
      expect(next).not.toBe(initial);
    });

    it('appends the provided value when given', () => {
      const next = quoteReducer(initial, {
        type: 'ADD_DELIVERABLE',
        value: 'AR 立體攝影檔',
      });
      expect(next.deliverables).toEqual(['AR 立體攝影檔']);
    });

    it('preserves existing items when appending', () => {
      const seeded = { ...initial, deliverables: ['A', 'B'] };
      const next = quoteReducer(seeded, { type: 'ADD_DELIVERABLE', value: 'C' });
      expect(next.deliverables).toEqual(['A', 'B', 'C']);
    });
  });

  describe('UPDATE_DELIVERABLE', () => {
    it('replaces the item at the given index', () => {
      const seeded = { ...initial, deliverables: ['old', 'keep'] };
      const next = quoteReducer(seeded, {
        type: 'UPDATE_DELIVERABLE',
        index: 0,
        value: 'new',
      });
      expect(next.deliverables).toEqual(['new', 'keep']);
    });

    it('returns the same state when the value is identical (no-op)', () => {
      const seeded = { ...initial, deliverables: ['same'] };
      const next = quoteReducer(seeded, {
        type: 'UPDATE_DELIVERABLE',
        index: 0,
        value: 'same',
      });
      expect(next).toBe(seeded);
    });
  });

  describe('REMOVE_DELIVERABLE', () => {
    it('removes the item at the given index', () => {
      const seeded = { ...initial, deliverables: ['a', 'b', 'c'] };
      const next = quoteReducer(seeded, { type: 'REMOVE_DELIVERABLE', index: 1 });
      expect(next.deliverables).toEqual(['a', 'c']);
    });

    it('returns the same state when index is out of bounds (defensive)', () => {
      const seeded = { ...initial, deliverables: ['only'] };
      const next = quoteReducer(seeded, { type: 'REMOVE_DELIVERABLE', index: 5 });
      expect(next).toBe(seeded);
    });

    it('returns the same state when index is negative', () => {
      const seeded = { ...initial, deliverables: ['only'] };
      const next = quoteReducer(seeded, { type: 'REMOVE_DELIVERABLE', index: -1 });
      expect(next).toBe(seeded);
    });
  });

  describe('ADD_NOTE / UPDATE_NOTE / REMOVE_NOTE', () => {
    // Start from an explicitly-empty notes list so these assertions test the
    // reducer transitions, not the createBlankQuote() default seed (which now
    // pre-fills 3 disclaimer notes — covered separately above).
    let empty: Quote;
    beforeEach(() => {
      empty = { ...initial, notes: [] };
    });

    it('ADD_NOTE appends; UPDATE_NOTE replaces; REMOVE_NOTE deletes', () => {
      let s = empty;
      s = quoteReducer(s, { type: 'ADD_NOTE', value: 'first' });
      s = quoteReducer(s, { type: 'ADD_NOTE', value: 'second' });
      expect(s.notes).toEqual(['first', 'second']);

      s = quoteReducer(s, { type: 'UPDATE_NOTE', index: 0, value: 'updated' });
      expect(s.notes).toEqual(['updated', 'second']);

      s = quoteReducer(s, { type: 'REMOVE_NOTE', index: 1 });
      expect(s.notes).toEqual(['updated']);
    });

    it('UPDATE_NOTE is a no-op when value is unchanged', () => {
      const seeded = { ...empty, notes: ['same'] };
      const next = quoteReducer(seeded, { type: 'UPDATE_NOTE', index: 0, value: 'same' });
      expect(next).toBe(seeded);
    });
  });

  // ─── Session 2.5: discount / adjustment + Session 4: services ───────────

  describe('group discount / adjustment + service sync', () => {
    function gidOf(s: Quote): string {
      return s.groups[0].id;
    }
    // A catalog-style item with prices + a service description.
    const catItem = {
      id: 'i-1',
      sub_group: 'A-1',
      name: 'AR 立體攝影',
      unit: '件',
      qty: 1,
      unitPrice: 12000,
      priceTier: 'price_standard',
      discount: 0,
      service_description: '【拍攝】\n720°',
      priceStandard: 12000,
      priceArts: 9600,
      isManual: false,
    };

    it('ADD_ITEM re-syncs services from the item sub_group', () => {
      const gid = gidOf(initial);
      const next = quoteReducer(initial, { type: 'ADD_ITEM', gid, item: catItem });
      expect(next.services).toHaveLength(1);
      expect(next.services[0].sub_group).toBe('A-1');
      expect(next.services[0].hasAppendix).toBe(true);
    });

    it('SET_GROUP_DISCOUNT toggles the flag; turning off also clears autoDiscount', () => {
      const gid = gidOf(initial);
      let s = quoteReducer(initial, { type: 'SET_GROUP_DISCOUNT', gid, hasDiscount: true });
      s = quoteReducer(s, { type: 'SET_GROUP_AUTO_DISCOUNT', gid, autoDiscount: true });
      expect(s.groups[0].hasDiscount).toBe(true);
      expect(s.groups[0].autoDiscount).toBe(true);
      s = quoteReducer(s, { type: 'SET_GROUP_DISCOUNT', gid, hasDiscount: false });
      expect(s.groups[0].hasDiscount).toBe(false);
      expect(s.groups[0].autoDiscount).toBe(false);
    });

    it('SET_GROUP_AUTO_DISCOUNT fills item discount = max(0, priceStandard − priceArts)', () => {
      const gid = gidOf(initial);
      let s = quoteReducer(initial, { type: 'ADD_ITEM', gid, item: catItem });
      s = quoteReducer(s, { type: 'SET_GROUP_DISCOUNT', gid, hasDiscount: true });
      s = quoteReducer(s, { type: 'SET_GROUP_AUTO_DISCOUNT', gid, autoDiscount: true });
      const it = s.groups[0].items[0];
      expect(it.unitPrice).toBe(12000); // reset to list price
      expect(it.discount).toBe(2400); // 12000 − 9600
    });

    it('auto-discount skips manual items (no priceStandard)', () => {
      const gid = gidOf(initial);
      const manual = {
        ...catItem,
        id: 'm-1',
        isManual: true,
        priceStandard: undefined,
        priceArts: undefined,
      };
      let s = quoteReducer(initial, { type: 'ADD_ITEM', gid, item: manual });
      s = quoteReducer(s, { type: 'SET_GROUP_AUTO_DISCOUNT', gid, autoDiscount: true });
      expect(s.groups[0].items[0].discount).toBe(0); // unchanged
    });

    it('auto-discount skips rows with a blank/0 standard price (Codex P2 #4)', () => {
      const gid = gidOf(initial);
      // arts-only row (blank standard → 0) must not be zeroed by auto-discount.
      const artsOnly = {
        ...catItem,
        id: 'a-only',
        unitPrice: 9600,
        priceStandard: 0,
        priceArts: 9600,
      };
      let s = quoteReducer(initial, { type: 'ADD_ITEM', gid, item: artsOnly });
      s = quoteReducer(s, { type: 'SET_GROUP_AUTO_DISCOUNT', gid, autoDiscount: true });
      const it = s.groups[0].items[0];
      expect(it.unitPrice).toBe(9600); // not zeroed
      expect(it.discount).toBe(0);
    });

    it('SET_GROUP_ADJUSTMENT_ENABLED + SET_GROUP_ADJUSTMENT update label / amount', () => {
      const gid = gidOf(initial);
      let s = quoteReducer(initial, {
        type: 'SET_GROUP_ADJUSTMENT_ENABLED',
        gid,
        hasAdjustment: true,
      });
      s = quoteReducer(s, { type: 'SET_GROUP_ADJUSTMENT', gid, field: 'label', value: '議價折讓' });
      s = quoteReducer(s, { type: 'SET_GROUP_ADJUSTMENT', gid, field: 'amount', value: '-500' });
      expect(s.groups[0].hasAdjustment).toBe(true);
      expect(s.groups[0].adjustment).toEqual({ label: '議價折讓', amount: -500 });
    });

    it('SET_GROUP_ADJUSTMENT coerces a non-numeric amount to 0', () => {
      const gid = gidOf(initial);
      let s = quoteReducer(initial, {
        type: 'SET_GROUP_ADJUSTMENT_ENABLED',
        gid,
        hasAdjustment: true,
      });
      s = quoteReducer(s, { type: 'SET_GROUP_ADJUSTMENT', gid, field: 'amount', value: 'abc' });
      expect(s.groups[0].adjustment?.amount).toBe(0);
    });

    it('UPDATE_SERVICE edits summary / includeAppendix and is a no-op for unknown sub_group', () => {
      const gid = gidOf(initial);
      let s = quoteReducer(initial, { type: 'ADD_ITEM', gid, item: catItem });
      s = quoteReducer(s, {
        type: 'UPDATE_SERVICE',
        sub_group: 'A-1',
        patch: { summary: 'hi', includeAppendix: false },
      });
      expect(s.services[0].summary).toBe('hi');
      expect(s.services[0].includeAppendix).toBe(false);
      const same = quoteReducer(s, {
        type: 'UPDATE_SERVICE',
        sub_group: 'ZZZ',
        patch: { summary: 'x' },
      });
      expect(same).toBe(s); // no matching sub_group → same reference
    });

    it('REMOVE_ITEM re-syncs services (drops the now-absent sub_group)', () => {
      const gid = gidOf(initial);
      let s = quoteReducer(initial, { type: 'ADD_ITEM', gid, item: catItem });
      expect(s.services).toHaveLength(1);
      s = quoteReducer(s, { type: 'REMOVE_ITEM', gid, itemId: 'i-1' });
      expect(s.services).toEqual([]);
    });

    it('MOVE_ITEM reorders items within a group', () => {
      const gid = gidOf(initial);
      let s = quoteReducer(initial, {
        type: 'ADD_ITEM',
        gid,
        item: { ...catItem, id: 'a', name: 'A' },
      });
      s = quoteReducer(s, { type: 'ADD_ITEM', gid, item: { ...catItem, id: 'b', name: 'B' } });
      s = quoteReducer(s, { type: 'ADD_ITEM', gid, item: { ...catItem, id: 'c', name: 'C' } });
      expect(s.groups[0].items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
      // Move index 2 (c) to index 0 → c, a, b
      s = quoteReducer(s, { type: 'MOVE_ITEM', gid, fromIndex: 2, toIndex: 0 });
      expect(s.groups[0].items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
    });

    it('MOVE_ITEM is a no-op for same index / out-of-bounds (same reference)', () => {
      const gid = gidOf(initial);
      const s = quoteReducer(initial, { type: 'ADD_ITEM', gid, item: { ...catItem, id: 'a' } });
      expect(quoteReducer(s, { type: 'MOVE_ITEM', gid, fromIndex: 0, toIndex: 0 })).toBe(s);
      expect(quoteReducer(s, { type: 'MOVE_ITEM', gid, fromIndex: 0, toIndex: 9 })).toBe(s);
      expect(quoteReducer(s, { type: 'MOVE_ITEM', gid, fromIndex: -1, toIndex: 0 })).toBe(s);
    });
  });

  describe('SET_PAYMENT', () => {
    it('updates one payment field without touching siblings', () => {
      const next = quoteReducer(initial, {
        type: 'SET_PAYMENT',
        field: 'terms',
        value: '簽約 50% / 驗收 50%',
      });
      expect(next.payment.terms).toBe('簽約 50% / 驗收 50%');
      expect(next.payment.currency).toBe(initial.payment.currency);
      expect(next.payment.method).toBe(initial.payment.method);
      expect(next.client).toBe(initial.client);
    });

    it('returns the same state when value is identical (no-op)', () => {
      const next = quoteReducer(initial, {
        type: 'SET_PAYMENT',
        field: 'currency',
        value: initial.payment.currency,
      });
      expect(next).toBe(initial);
    });
  });
});
