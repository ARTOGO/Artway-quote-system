// Service-summary + appendix derivation — pure functions.
//
// Mirrors legacy `parseAppendixSections` (line 2323), `syncServices`
// (line 2341), and `getAutoSummary` (line 2314). The 02 服務說明摘要 section
// + the per-sub_group appendix pages are both derived from each item's
// `service_description` (sheet "D 欄"), deduped by `sub_group`.

import type { QuoteGroup, QuoteService } from '../state/quoteTypes';

export interface AppendixSection {
  title: string;
  bullets: string[];
}

/**
 * Parse a service-description blob into sections. A line wrapped in 【】 or []
 * starts a new section (its title); every other non-empty line becomes a
 * bullet (leading ．・·*-• markers stripped). Legacy line 2323-2339.
 */
export function parseAppendixSections(text: string): AppendixSection[] {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const sections: AppendixSection[] = [];
  let current: AppendixSection = { title: '', bullets: [] };
  for (const line of lines) {
    const header = line.match(/^[【[](.+?)[\]】]\s*$/);
    if (header) {
      if (current.bullets.length > 0 || current.title) sections.push(current);
      current = { title: header[1], bullets: [] };
    } else {
      const cleaned = line.replace(/^[．・·*\-•\s]+/, '').trim();
      if (cleaned) current.bullets.push(cleaned);
    }
  }
  if (current.bullets.length > 0 || current.title) sections.push(current);
  return sections;
}

/**
 * Derive the per-sub_group services list from the items present in `groups`,
 * preserving the user's edits (`summary`, `includeAppendix`) from
 * `prevServices`. Mirrors legacy `syncServices` (line 2341): unique sub_groups
 * in first-seen order; `service_description` taken from the first item that
 * carries one for that sub_group; `hasAppendix` = description non-empty.
 */
export function syncServices(
  groups: ReadonlyArray<QuoteGroup>,
  prevServices: ReadonlyArray<QuoteService>,
): QuoteService[] {
  const order: string[] = [];
  const descBySub = new Map<string, string>();
  const seen = new Set<string>();
  for (const g of groups) {
    for (const item of g.items) {
      const sg = item.sub_group;
      if (!sg) continue;
      if (!seen.has(sg)) {
        seen.add(sg);
        order.push(sg);
      }
      // First non-empty service_description for this sub_group wins.
      const desc = (item.service_description || '').trim();
      if (desc && !descBySub.get(sg)) descBySub.set(sg, desc);
    }
  }

  const prev = new Map(prevServices.map((s) => [s.sub_group, s]));
  return order.map((sg) => {
    const prevEntry = prev.get(sg);
    // Prefer the item-carried description; fall back to a previously-synced one
    // (e.g. a saved/legacy quote whose items predate the per-item field) so
    // re-syncing on LOAD never wipes the appendix (Codex P2 #2).
    const desc = descBySub.get(sg) || prevEntry?.service_description || '';
    const hasAppendix = desc.trim().length > 0;
    return {
      sub_group: sg,
      summary: prevEntry?.summary ?? '',
      service_description: desc,
      hasAppendix,
      // Preserve the user's appendix toggle (default on).
      includeAppendix: prevEntry?.includeAppendix ?? true,
    };
  });
}
