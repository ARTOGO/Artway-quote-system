import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../api/quotes';
import type { QuoteListItem } from '../../api/quotes';
import { QuoteProvider, useQuoteState } from '../../state/QuoteContext';
import { createBlankQuote } from '../../state/quoteReducer';
import { History } from './History';

function renderHistory(): void {
  render(
    <QuoteProvider>
      <History />
    </QuoteProvider>,
  );
}

function item(over: Partial<QuoteListItem> = {}): QuoteListItem {
  return {
    id: 'id-1',
    quote_no: 'AW-260521-001',
    status: 'sent',
    title: '專案A',
    total_amount: 10500,
    client_company: '客戶A',
    sales_name: '業務A',
    issue_date: '2026-05-21',
    updated_at: '2026-05-21T10:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  vi.spyOn(api, 'distinctSales').mockResolvedValue(['業務A', '業務B']);
});
afterEach(() => vi.restoreAllMocks());

describe('History', () => {
  it('renders the quote list (number link, title, status pill)', async () => {
    vi.spyOn(api, 'listQuotes').mockResolvedValue({
      items: [item()],
      total: 1,
      page: 1,
      page_size: 20,
    });
    renderHistory();
    const link = await screen.findByRole('link', { name: 'AW-260521-001' });
    expect(link).toHaveAttribute('href', '#/quote/AW-260521-001');
    expect(screen.getByText('專案A')).toBeInTheDocument();
    // '已送出' is also a filter <option>; scope the status-pill check to the table.
    expect(within(screen.getByRole('table')).getByText('已送出')).toBeInTheDocument();
    expect(screen.getByTestId('history-summary').textContent).toContain('共 1 筆');
  });

  it('shows the empty state when there are no quotes', async () => {
    vi.spyOn(api, 'listQuotes').mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    renderHistory();
    expect(await screen.findByText(/沒有符合條件的報價單/)).toBeInTheDocument();
  });

  it('refetches with the status filter applied (and resets to page 1)', async () => {
    const listSpy = vi.spyOn(api, 'listQuotes').mockResolvedValue({
      items: [item()],
      total: 1,
      page: 1,
      page_size: 20,
    });
    renderHistory();
    await screen.findByRole('link', { name: 'AW-260521-001' });
    await userEvent.selectOptions(screen.getByLabelText('狀態篩選'), 'signed');
    await waitFor(() =>
      expect(listSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'signed', page: 1 }),
        expect.anything(),
      ),
    );
  });

  it('deletes a row after confirm, then refetches the list (server pagination consistency)', async () => {
    // Page 1 has the row; after delete the server returns it empty → refetch must
    // pull the fresh (empty) page rather than only filtering locally (Codex P2).
    const listSpy = vi
      .spyOn(api, 'listQuotes')
      .mockResolvedValueOnce({ items: [item()], total: 1, page: 1, page_size: 20 })
      .mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    const delSpy = vi.spyOn(api, 'deleteQuote').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderHistory();
    await screen.findByRole('link', { name: 'AW-260521-001' });
    await userEvent.click(screen.getByRole('button', { name: '刪除' }));
    expect(delSpy).toHaveBeenCalledWith('id-1');
    // Re-fetched from the server (called again after the initial load).
    await waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(await screen.findByText(/沒有符合條件的報價單/)).toBeInTheDocument();
  });

  it('clears the loaded Builder quote when its row is deleted (Codex P2)', async () => {
    vi.spyOn(api, 'listQuotes')
      .mockResolvedValueOnce({ items: [item({ id: 'id-X' })], total: 1, page: 1, page_size: 20 })
      .mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    vi.spyOn(api, 'deleteQuote').mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    let probeId: string | null = 'sentinel';
    function Probe(): null {
      probeId = useQuoteState().state.id;
      return null;
    }
    // Builder state currently holds the same quote we are about to delete.
    const seed = { ...createBlankQuote(), id: 'id-X' };
    render(
      <QuoteProvider initial={seed}>
        <History />
        <Probe />
      </QuoteProvider>,
    );
    await screen.findByRole('link', { name: 'AW-260521-001' });
    expect(probeId).toBe('id-X');
    await userEvent.click(screen.getByRole('button', { name: '刪除' }));
    // newQuote() cleared the deleted quote from shared state (id back to null).
    await waitFor(() => expect(probeId).toBeNull());
  });
});
