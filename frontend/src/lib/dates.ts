// Date helpers — Asia/Taipei yyyy-mm-dd (aligns with backend's dateKey,
// see HISTORY_BACKEND_SPEC §3.1 + backend/internal/quotes/quotenum.go).
//
// Reviewer (Gemini #3265370142): the prior version used browser local time
// which silently mismatches the backend dateKey for staff on holiday in a
// non-TW timezone, OR running the app from a Cloud Run instance whose
// process tz defaults to UTC. `toLocaleDateString('sv-SE', { timeZone:
// 'Asia/Taipei' })` is the canonical way to get an ISO yyyy-mm-dd string
// in a specific timezone — Swedish locale formats dates as ISO and the
// timezone option overrides the JS engine's local interpretation.

const TAIPEI_TZ = 'Asia/Taipei';

/**
 * Returns the given Date's calendar date in Asia/Taipei as `yyyy-mm-dd`.
 * Default base is `new Date()` (today, in Taipei).
 */
export function todayISO(date: Date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: TAIPEI_TZ });
}

/**
 * Returns `base + days` as `yyyy-mm-dd` in Asia/Taipei. Negative values
 * supported (returns past dates).
 */
export function addDaysISO(days: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return todayISO(d);
}
