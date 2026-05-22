// ServicesSection (02 服務說明摘要) — Session 4 behaviour tests.
//
// Services are derived from the items in 01 專案報價內容, so the test seeds an
// item through the reducer (via context) then asserts the derived UI.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';

import { QuoteProvider, useQuoteState } from '../../../state/QuoteContext';
import type { QuoteItem } from '../../../state/quoteTypes';
import { ServicesSection } from './ServicesSection';

const catItem: QuoteItem = {
  id: 'i-1',
  sub_group: 'A-1',
  name: 'AR 立體攝影',
  unit: '件',
  qty: 1,
  unitPrice: 12000,
  service_description: '【拍攝規格】\n720° 環物',
};

// Seeds one catalog item into the starter group on mount so ServicesSection
// has a derived service to render.
function Seeder({ item }: { item: QuoteItem }): null {
  const { state, addItem } = useQuoteState();
  useEffect(() => {
    addItem(state.groups[0].id, item);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Probe(): React.ReactElement {
  const { state } = useQuoteState();
  return (
    <>
      <span data-testid="summary">{state.services[0]?.summary ?? ''}</span>
      <span data-testid="include">{String(state.services[0]?.includeAppendix ?? '')}</span>
    </>
  );
}

function mount(item: QuoteItem = catItem): { user: ReturnType<typeof userEvent.setup> } {
  render(
    <QuoteProvider>
      <Seeder item={item} />
      <ServicesSection />
      <Probe />
    </QuoteProvider>,
  );
  return { user: userEvent.setup() };
}

describe('ServicesSection', () => {
  it('shows the empty hint when there are no items', () => {
    render(
      <QuoteProvider>
        <ServicesSection />
      </QuoteProvider>,
    );
    expect(screen.getByText(/尚未加入任何品項/)).toBeInTheDocument();
  });

  it('renders a derived service row for the item sub_group', () => {
    mount();
    expect(screen.getByText('A-1')).toBeInTheDocument();
    // sub_group has a service_description → 含附件 toggle + 請見附件 note
    expect(screen.getByLabelText('含附件 A-1')).toBeInTheDocument();
    expect(screen.getByText(/完整服務說明請見/)).toBeInTheDocument();
  });

  it('editing the summary textarea updates state', async () => {
    const { user } = mount();
    const ta = screen.getByLabelText('服務摘要 A-1') as HTMLTextAreaElement;
    await user.type(ta, '含 2 次修改');
    expect(screen.getByTestId('summary').textContent).toBe('含 2 次修改');
  });

  it('unchecking 含附件 hides the 請見附件 note and flips includeAppendix', async () => {
    const { user } = mount();
    expect(screen.getByTestId('include').textContent).toBe('true');
    await user.click(screen.getByLabelText('含附件 A-1'));
    expect(screen.getByTestId('include').textContent).toBe('false');
    expect(screen.queryByText(/完整服務說明請見/)).not.toBeInTheDocument();
  });

  it('an item with no service_description shows no 含附件 toggle', () => {
    mount({ ...catItem, sub_group: 'B-2', service_description: '' });
    expect(screen.getByText('B-2')).toBeInTheDocument();
    expect(screen.queryByLabelText('含附件 B-2')).toBeNull();
  });
});
