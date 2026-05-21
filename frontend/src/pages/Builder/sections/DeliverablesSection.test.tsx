// DeliverablesSection — Session 3 behaviour tests.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { QuoteProvider, useQuoteState } from '../../../state/QuoteContext';
import { DeliverablesSection } from './DeliverablesSection';

function Probe(): React.ReactElement {
  const { state } = useQuoteState();
  return (
    <>
      <span data-testid="count">{state.deliverables.length}</span>
      <span data-testid="first">{state.deliverables[0] ?? ''}</span>
      <span data-testid="second">{state.deliverables[1] ?? ''}</span>
    </>
  );
}

function mount(): { user: ReturnType<typeof userEvent.setup> } {
  render(
    <QuoteProvider>
      <DeliverablesSection />
      <Probe />
    </QuoteProvider>,
  );
  return { user: userEvent.setup() };
}

describe('DeliverablesSection', () => {
  it('starts empty and shows the empty hint', () => {
    mount();
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByText(/按「\+ 新增」加交付項目/)).toBeInTheDocument();
  });

  it('clicking "+ 新增" appends an empty deliverable row', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增' }));
    expect(screen.getByTestId('count').textContent).toBe('1');
    // Empty hint is replaced by an input row.
    expect(screen.queryByText(/按「\+ 新增」加交付項目/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('交付項目 1')).toBeInTheDocument();
  });

  it('typing into a row updates the state', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增' }));
    const input = screen.getByLabelText('交付項目 1') as HTMLInputElement;
    await user.type(input, 'AR 立體攝影檔');
    expect(screen.getByTestId('first').textContent).toBe('AR 立體攝影檔');
  });

  it('the ✕ button removes a row', async () => {
    const { user } = mount();
    const addBtn = screen.getByRole('button', { name: '+ 新增' });
    await user.click(addBtn);
    await user.click(addBtn);
    expect(screen.getByTestId('count').textContent).toBe('2');

    await user.click(screen.getByRole('button', { name: '移除交付項目 1' }));
    expect(screen.getByTestId('count').textContent).toBe('1');
  });
});
