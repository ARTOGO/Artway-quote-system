import { describe, expect, it } from 'vitest';

import { groupTitleFor, newGroupId, newItemId, nextGroupSeq } from './groupId';

describe('newGroupId', () => {
  it('produces a `g_<ts>_<rand>` shape', () => {
    const id = newGroupId(1234567890);
    expect(id).toMatch(/^g_1234567890_[a-z0-9]{4}$/);
  });

  it('two consecutive calls produce different IDs', () => {
    const a = newGroupId();
    const b = newGroupId();
    expect(a).not.toBe(b);
  });
});

describe('newItemId', () => {
  it('produces an `i_<ts>_<rand>` shape', () => {
    expect(newItemId(1234567890)).toMatch(/^i_1234567890_[a-z0-9]{4}$/);
  });
});

describe('nextGroupSeq', () => {
  it('returns 1 for an empty list', () => {
    expect(nextGroupSeq([])).toBe(1);
  });

  it('returns max(seq) + 1', () => {
    expect(nextGroupSeq([{ seq: 1 }, { seq: 2 }])).toBe(3);
    expect(nextGroupSeq([{ seq: 7 }])).toBe(8);
  });

  it('handles non-contiguous sequences (after a delete)', () => {
    // Legacy `nextGroupNum` never decrements after delete — we mirror that
    // by always returning max+1 even if there are gaps.
    expect(nextGroupSeq([{ seq: 1 }, { seq: 3 }])).toBe(4);
  });

  it('is independent of the title — renaming A-1 to anything keeps next at 2', () => {
    // C2 root cause: the OLD `nextGroupTitle(titles)` regex would miss a
    // renamed first group and produce A-1 again. New seq-based version is
    // immune.
    const groups = [{ seq: 1 }]; // imagine title was renamed to "設計費"
    expect(nextGroupSeq(groups)).toBe(2);
  });
});

describe('groupTitleFor', () => {
  it('formats the legacy default placeholder', () => {
    expect(groupTitleFor(1)).toBe('A-1．（請輸入組別名稱）');
    expect(groupTitleFor(12)).toBe('A-12．（請輸入組別名稱）');
  });
});
