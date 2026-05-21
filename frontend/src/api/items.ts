// Live items catalog — fetched from the ARTOGO Google Apps Script endpoint
// (legacy.html line 2083/2144 `fetchItems`). Returns the full real item list
// (hundreds of rows) the business maintains in a Google Sheet.
//
// Cross-origin GET to an Apps Script `exec` URL (CORS-allowed; legacy fetches
// it the same way from the browser). Result is cached at module level so the
// many short-lived CatalogPicker instances share one network call. On any
// failure the caller (useItemsCatalog) falls back to the bundled fixture so
// the picker is always usable offline / if the sheet is unreachable.

import { type CatalogItem } from '../lib/itemsCatalog';

export const CATALOG_API_URL =
  'https://script.google.com/macros/s/AKfycbzdPKU9Ul1Cy5STvFLAI9bMah0SAPDr-fyToPaQ6k-QrDNqJ-KKXiWIkrhG6el74X78/exec';

interface RawItem {
  group?: unknown;
  sub_group?: unknown;
  name?: unknown;
  unit?: unknown;
  price_standard?: unknown;
  price_arts?: unknown;
  service_description?: unknown;
}

/** Coerce a sheet cell ("12,000" / 12000 / "  " / null) to an integer NTD. */
function toInt(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

/**
 * Normalise the raw API payload (`{ items: [...] }`) into CatalogItem[].
 * Drops rows with no group/sub_group/name; coerces comma-string prices.
 * Pure + exported for unit testing.
 */
export function normalizeCatalog(payload: unknown): CatalogItem[] {
  const rawItems =
    payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? ((payload as { items: RawItem[] }).items ?? [])
      : [];
  return rawItems
    .map((it) => ({
      group: str(it.group),
      sub_group: str(it.sub_group),
      name: str(it.name),
      unit: str(it.unit),
      price_standard: toInt(it.price_standard),
      price_arts: toInt(it.price_arts),
      // service_description keeps internal newlines (parsed into appendix
      // sections); only trim the outer whitespace.
      service_description: String(it.service_description ?? '').trim(),
    }))
    .filter((it) => it.group !== '' || it.sub_group !== '' || it.name !== '');
}

let cache: CatalogItem[] | null = null;
let inflight: Promise<CatalogItem[]> | null = null;

/**
 * Fetch + cache the live catalog. Shared across callers (one network call).
 * Throws on network / HTTP / empty-payload errors so callers can fall back.
 * Note: intentionally does NOT take an AbortSignal — the request is shared,
 * so one consumer unmounting must not cancel it for the others.
 */
export async function fetchItemsCatalog(): Promise<CatalogItem[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch(CATALOG_API_URL);
    if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
    const data: unknown = await res.json();
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      (data as { error?: unknown }).error
    ) {
      throw new Error(String((data as { error: unknown }).error));
    }
    const items = normalizeCatalog(data);
    if (items.length === 0) throw new Error('catalog empty');
    cache = items;
    return items;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null; // allow retry after a failure (cache stays set on success)
  }
}

/** Test/diagnostic helper — drop the module cache so the next call refetches. */
export function clearCatalogCache(): void {
  cache = null;
  inflight = null;
}
