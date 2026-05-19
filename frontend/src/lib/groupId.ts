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
 * Default group title: `A-1．（請輸入組別名稱）` — `A-1` for the first group,
 * `A-2` for the second, etc. Legacy `nextGroupNum` counter (line 2560).
 * We compute from existing groups so it's stateless / pure.
 */
export function nextGroupTitle(existingTitles: ReadonlyArray<string>): string {
  // Find max numeric suffix in `A-<n>` prefix
  let max = 0;
  for (const t of existingTitles) {
    const m = /^A-(\d+)/.exec(t);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `A-${max + 1}．（請輸入組別名稱）`;
}
