// Date helpers — local-timezone yyyy-mm-dd (matches legacy line 2129-2137).
//
// Browser local time is used (Asia/Taipei for ARTOGO staff). When PR 5 wires
// the backend `/api/quotes/next-number`, the server-side dateKey will use
// Asia/Taipei explicitly (per HISTORY_BACKEND_SPEC §3.1). Mismatch only
// occurs if an employee runs the tool from a non-TW timezone, which doesn't
// happen today.

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Returns today's date as `yyyy-mm-dd` using the browser's local timezone.
 */
export function todayISO(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Returns today + `days` as `yyyy-mm-dd` using the browser's local timezone.
 * Negative values supported (returns past dates).
 */
export function addDaysISO(days: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}
