import { describe, expect, it, vi } from 'vitest';

import { buildPdfFilename, printWithCustomFilename } from './print';

// Mirrors legacy printWithCustomFilename (legacy.html:3138-3159): the PDF
// filename is 藝途科技報價單<quoteNo>_<date>_<client>_<project>, unsafe chars
// stripped, empty segments dropped; Chrome uses document.title as the default
// "Save as PDF" filename, so we swap the title around window.print().
describe('buildPdfFilename', () => {
  it('joins 藝途科技報價單<quoteNo>_<date>_<client>_<project>', () => {
    expect(
      buildPdfFilename({
        quoteNo: 'AW-260515-008',
        dateISO: '2026-05-15',
        clientCompany: '客戶名稱',
        projectTitle: '專案名稱',
      }),
    ).toBe('藝途科技報價單AW-260515-008_2026-05-15_客戶名稱_專案名稱');
  });

  it('falls back to AW-quote when quoteNo is blank', () => {
    expect(
      buildPdfFilename({ quoteNo: '', dateISO: '2026-05-15', clientCompany: '', projectTitle: '' }),
    ).toBe('藝途科技報價單AW-quote_2026-05-15');
  });

  it('strips filesystem-unsafe characters', () => {
    expect(
      buildPdfFilename({
        quoteNo: 'AW/1:2*?',
        dateISO: '2026-05-15',
        clientCompany: 'A<B>',
        projectTitle: 'x"y',
      }),
    ).toBe('藝途科技報價單AW12_2026-05-15_AB_xy');
  });

  it('drops empty client / project segments (filter Boolean)', () => {
    expect(
      buildPdfFilename({
        quoteNo: 'AW-1',
        dateISO: '2026-05-15',
        clientCompany: '',
        projectTitle: '專案',
      }),
    ).toBe('藝途科技報價單AW-1_2026-05-15_專案');
  });
});

describe('printWithCustomFilename', () => {
  it('swaps document.title to the filename for the print, then restores on afterprint', () => {
    const original = 'ARTWAY 報價單系統';
    document.title = original;
    let titleAtPrint = '';
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {
      titleAtPrint = document.title;
    });

    printWithCustomFilename({
      quoteNo: 'AW-1',
      dateISO: '2026-05-15',
      clientCompany: 'C',
      projectTitle: 'P',
    });

    // Title is the PDF filename at the moment print() runs.
    expect(titleAtPrint).toBe('藝途科技報價單AW-1_2026-05-15_C_P');
    expect(printSpy).toHaveBeenCalledOnce();

    // Chrome fires afterprint when the dialog closes → title restored.
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe(original);

    printSpy.mockRestore();
  });
});
