// Hash-based routing.
//
// Why hash routing (vs HTML5 history API):
//   1) Legacy 4228 行 index.html 已用 hash routing — 業務書籤 `#/history` /
//      `#/quote/AW-260516-001` 不能斷
//   2) Cloud Run + Go embed 模式不需 server-side 路由配合（rewrite 規則）
//   3) PR 3-5 階段 SPA 直接 serve static dist/，hash 路由零 server config
//
// Supported routes:
//   #/                          → Builder（新報價）
//   #/history                   → History page
//   #/quote/{quote_no}          → 載入該筆進 Builder（業務 deep link）
//
// 詳見 legacy frontend/index.html line 3556-3585 (handleRoute 函式).

import { useEffect, useState } from 'react';

export type Route =
  | { name: 'builder' }
  | { name: 'history' }
  | { name: 'quote-detail'; quoteNo: string };

/**
 * Parse a `window.location.hash` string into a typed Route.
 *
 * Examples:
 *   ''                  → builder
 *   '#'                 → builder
 *   '#/'                → builder
 *   '#/history'         → history
 *   '#/history?x=1'     → history (extra query stripped — legacy 不用 query)
 *   '#/quote/AW-260516-001' → quote-detail
 *   '#/something-else'  → builder (graceful fallback)
 */
export function parseHash(hash: string): Route {
  // Strip leading '#' and optional leading '/'
  let clean = hash.replace(/^#/, '').replace(/^\//, '');

  // Strip query string (legacy doesn't use it; future-proof)
  const queryIdx = clean.indexOf('?');
  if (queryIdx >= 0) {
    clean = clean.slice(0, queryIdx);
  }

  if (clean === '') {
    return { name: 'builder' };
  }
  if (clean === 'history') {
    return { name: 'history' };
  }
  const quoteMatch = /^quote\/(.+)$/.exec(clean);
  if (quoteMatch) {
    // decodeURIComponent throws URIError on malformed percent encoding
    // (e.g. `%E0%A4%A` from a truncated bookmark, or just `%`). Fall back
    // to Builder rather than crash the whole app on initial load.
    // Reviewer flagged: Gemini #3257443997 + Codex #3257453832 (both P1).
    try {
      return { name: 'quote-detail', quoteNo: decodeURIComponent(quoteMatch[1]) };
    } catch {
      return { name: 'builder' };
    }
  }
  // Unknown route — fall back to Builder rather than 404.
  // (Legacy behaviour; safer for business than a hard 404 page.)
  return { name: 'builder' };
}

/**
 * React hook that returns the current Route and re-renders on hashchange.
 *
 * Re-renders are minimal because parseHash returns a new object only when
 * the hash actually changes (browser fires `hashchange` exactly once per
 * navigation).
 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  return route;
}

/**
 * Programmatic navigation. Setting `window.location.hash` fires `hashchange`
 * so subscribed components re-render automatically.
 *
 * Pass `{ replace: true }` to replace the current history entry instead of
 * pushing a new one — used when normalizing the #/quote/{quote_no} deep link to
 * #/ after a successful load, so Back returns to History rather than the stale
 * deep link (which would reload + re-replace, trapping the user). Codex review.
 *
 * Example:
 *   navigate('/history')                  // → #/history (push)
 *   navigate('/', { replace: true })      // replace #/quote/... with #/
 */
export function navigate(to: string, opts?: { replace?: boolean }): void {
  // Ensure leading '/' so #/history and #history both work the same.
  const normalised = to.startsWith('/') ? to : `/${to}`;
  if (opts?.replace) {
    // history.replaceState doesn't fire hashchange — dispatch it so subscribers
    // (useHashRoute) re-parse the now-updated location.hash.
    window.history.replaceState(null, '', `#${normalised}`);
    window.dispatchEvent(new Event('hashchange'));
  } else {
    window.location.hash = normalised;
  }
}
