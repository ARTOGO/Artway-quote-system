// React hook wrapping the live catalog fetch with a fixture fallback.
//
// Returns the bundled fixture immediately (so the picker is never empty),
// then swaps in the live Google Sheet catalog once it loads. On failure it
// keeps the fixture and surfaces an `error` message for a subtle UI note.

import { useEffect, useState } from 'react';

import { fetchItemsCatalog } from '../api/items';
import { ITEMS_CATALOG_FIXTURE, type CatalogItem } from './itemsCatalog';

export interface ItemsCatalogState {
  catalog: ReadonlyArray<CatalogItem>;
  loading: boolean;
  /** Non-null when the live fetch failed and the fixture is being used. */
  error: string | null;
  /** True once the live (non-fixture) catalog has loaded. */
  live: boolean;
}

export function useItemsCatalog(): ItemsCatalogState {
  const [state, setState] = useState<ItemsCatalogState>({
    catalog: ITEMS_CATALOG_FIXTURE,
    loading: true,
    error: null,
    live: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetchItemsCatalog()
      .then((items) => {
        if (!cancelled) setState({ catalog: items, loading: false, error: null, live: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          catalog: ITEMS_CATALOG_FIXTURE,
          loading: false,
          error: err instanceof Error ? err.message : '品項載入失敗',
          live: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
