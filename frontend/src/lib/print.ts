// PDF export — mirrors legacy `printWithCustomFilename` (legacy.html:3138-3159).
//
// The quote "PDF" is the browser's native print → "Save as PDF" (same as
// legacy; there is no server-side PDF). Chrome uses `document.title` as the
// default save filename, so we swap the title to a quote-derived name around
// `window.print()` and restore it on `afterprint` (with a timeout fallback in
// case the event never fires).

export interface PdfFilenameParts {
  quoteNo: string;
  dateISO: string; // print date, YYYY-MM-DD
  clientCompany: string;
  projectTitle: string;
}

// Strip filesystem-unsafe characters (legacy `safe`, line 3140).
function safe(s: string): string {
  return String(s || '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '')
    .trim();
}

/**
 * Build the "Save as PDF" filename:
 * 藝途科技報價單<quoteNo>_<date>_<client>_<project>, unsafe chars stripped and
 * empty segments dropped. quoteNo falls back to `AW-quote` (legacy line 3141).
 */
export function buildPdfFilename({
  quoteNo,
  dateISO,
  clientCompany,
  projectTitle,
}: PdfFilenameParts): string {
  const no = safe(quoteNo) || 'AW-quote';
  return ['藝途科技報價單' + no, dateISO, safe(clientCompany), safe(projectTitle)]
    .filter(Boolean)
    .join('_');
}

/** Swap document.title to the PDF filename, print, then restore the title. */
export function printWithCustomFilename(parts: PdfFilenameParts): void {
  const filename = buildPdfFilename(parts);
  const originalTitle = document.title;
  document.title = filename;
  const restore = (): void => {
    document.title = originalTitle;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  // Fallback if afterprint never fires (cancelled dialog / unsupported).
  setTimeout(restore, 1500);
  window.print();
}
