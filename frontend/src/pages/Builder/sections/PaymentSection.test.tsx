// PaymentSection — Session 3 behaviour tests.
//
// Confirms each field (terms / currency / method / deliveryNote) wires
// through SET_PAYMENT and that the default seeded values (legacy
// parity: 新台幣 NTD / 銀行轉帳) survive mount.

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { QuoteProvider, useQuoteState } from '../../../state/QuoteContext';
import { PaymentSection } from './PaymentSection';

function Probe(): React.ReactElement {
  const { state } = useQuoteState();
  return (
    <>
      <span data-testid="terms">{state.payment.terms}</span>
      <span data-testid="currency">{state.payment.currency}</span>
      <span data-testid="method">{state.payment.method}</span>
      <span data-testid="deliveryNote">{state.payment.deliveryNote}</span>
    </>
  );
}

function mount(): { user: ReturnType<typeof userEvent.setup> } {
  render(
    <QuoteProvider>
      <PaymentSection />
      <Probe />
    </QuoteProvider>,
  );
  return { user: userEvent.setup() };
}

describe('PaymentSection', () => {
  it('renders the four fields with legacy default values', () => {
    mount();
    // terms / deliveryNote are now seeded by createBlankQuote (legacy parity).
    expect(screen.getByTestId('terms').textContent).toBe('簽約時 50%\n驗收時 50%');
    expect(screen.getByTestId('currency').textContent).toBe('新台幣 NTD');
    expect(screen.getByTestId('method').textContent).toBe('銀行轉帳');
    expect(screen.getByTestId('deliveryNote').textContent).toBe('收款後 6 個工作週');
  });

  it('typing into 付款條件 (terms textarea) updates state', async () => {
    const { user } = mount();
    const terms = screen.getByLabelText('付款條件') as HTMLTextAreaElement;
    await user.clear(terms); // clear the seeded default first
    await user.type(terms, '簽約 50%');
    expect(screen.getByTestId('terms').textContent).toBe('簽約 50%');
  });

  it('typing into 幣別 updates state', async () => {
    const { user } = mount();
    const currency = screen.getByLabelText('幣別') as HTMLInputElement;
    await user.clear(currency);
    await user.type(currency, 'USD');
    expect(screen.getByTestId('currency').textContent).toBe('USD');
  });

  it('typing into 付款方式 updates state', async () => {
    const { user } = mount();
    const method = screen.getByLabelText('付款方式') as HTMLInputElement;
    await user.clear(method);
    await user.type(method, '支票');
    expect(screen.getByTestId('method').textContent).toBe('支票');
  });

  it('typing into 交期備註 textarea updates state', async () => {
    const { user } = mount();
    const note = screen.getByLabelText('交期備註') as HTMLTextAreaElement;
    await user.clear(note); // clear the seeded default first
    await user.type(note, '收款後 6 週');
    expect(screen.getByTestId('deliveryNote').textContent).toBe('收款後 6 週');
  });
});
