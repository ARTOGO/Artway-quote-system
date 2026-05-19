// Stable ID generators for QuoteGroup + QuoteItem.
//
// Legacy uses `g_<timestamp>_<rand>` (line 2575) and `i_<timestamp>_<rand>`.
// We mirror that — the IDs are React keys + reorder anchors (Session 2)
// AND persist into the backend's JSONB `body.groups[].id` so they survive
// save → list → load roundtrips.
//
// Format: `<prefix>_<timestamp>_<4-char-random>`.

function rand4(): string {
  return Math.random().toString(36).slice(2, 6);
}

export function newGroupId(now: number = Date.now()): string {
  return `g_${now}_${rand4()}`;
}

export function newItemId(now: number = Date.now()): string {
  return `i_${now}_${rand4()}`;
}

/**
 * Next group sequence number — `max(existing seq) + 1`, or 1 when empty.
 * Reviewer (Codex C2): drives default title via an *immutable* seq field
 * on each group rather than regex-matching the editable title, so removing
 * the `A-1` prefix via rename no longer collapses the next + 新增組 back
 * to `A-1`.
 */
export function nextGroupSeq(existing: ReadonlyArray<{ seq: number }>): number {
  if (existing.length === 0) return 1;
  return existing.reduce((m, g) => (g.seq > m ? g.seq : m), 0) + 1;
}

/** Default title for a freshly-added group: `A-<seq>．（請輸入組別名稱）`. */
export function groupTitleFor(seq: number): string {
  return `A-${seq}．（請輸入組別名稱）`;
}
