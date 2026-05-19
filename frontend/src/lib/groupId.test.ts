import { describe, expect, it } from 'vitest';

import { newGroupId, newItemId, nextGroupTitle } from './groupId';

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

describe('nextGroupTitle', () => {
  it('returns A-1 for empty list', () => {
    expect(nextGroupTitle([])).toBe('A-1．（請輸入組別名稱）');
  });

  it('increments past the max existing A-N', () => {
    expect(nextGroupTitle(['A-1．設計', 'A-2．實作'])).toBe('A-3．（請輸入組別名稱）');
  });

  it('ignores non-A prefix titles', () => {
    expect(nextGroupTitle(['Custom title', 'B-1 ignored'])).toBe('A-1．（請輸入組別名稱）');
  });

  it('handles gaps (A-1, A-3) correctly by using max+1', () => {
    expect(nextGroupTitle(['A-1', 'A-3'])).toBe('A-4．（請輸入組別名稱）');
  });
});
