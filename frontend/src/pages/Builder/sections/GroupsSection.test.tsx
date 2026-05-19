// GroupsSection — Session 2 behaviour tests.
//
// Focus: state mutations propagate correctly + UI affordances exist.
// SCSS / pixel-parity is not in scope (visual diff covered manually).

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QuoteProvider, useQuoteState } from '../../../state/QuoteContext';
import { GroupsSection } from './GroupsSection';

function Probe(): React.ReactElement {
  const { state } = useQuoteState();
  return (
    <>
      <span data-testid="group-count">{state.groups.length}</span>
      <span data-testid="first-group-title">{state.groups[0]?.title ?? ''}</span>
      <span data-testid="first-group-items">{state.groups[0]?.items.length ?? 0}</span>
      <span data-testid="first-item-amount">
        {state.groups[0]?.items[0]
          ? state.groups[0].items[0].qty * state.groups[0].items[0].unitPrice
          : 0}
      </span>
    </>
  );
}

function mount(): { user: ReturnType<typeof userEvent.setup> } {
  render(
    <QuoteProvider>
      <GroupsSection />
      <Probe />
    </QuoteProvider>,
  );
  return { user: userEvent.setup() };
}

beforeEach(() => {
  // Prevent the global QuoteProvider tests from leaking state via the cache
  // module memo (dates / fetchToken).
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GroupsSection — group lifecycle', () => {
  it('starts with zero groups and shows the empty hint', () => {
    mount();
    expect(screen.getByTestId('group-count').textContent).toBe('0');
    expect(screen.getByText(/按上方「\+ 新增組」開始/)).toBeInTheDocument();
  });

  it('clicking "+ 新增組" adds a group titled A-1', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    expect(screen.getByTestId('group-count').textContent).toBe('1');
    expect(screen.getByTestId('first-group-title').textContent).toMatch(/^A-1．/);
  });

  it('subsequent groups get incrementing titles (A-2, A-3)', async () => {
    const { user } = mount();
    const addBtn = screen.getByRole('button', { name: '+ 新增組' });
    await user.click(addBtn);
    await user.click(addBtn);
    await user.click(addBtn);
    expect(screen.getByTestId('group-count').textContent).toBe('3');
  });

  it('typing into the group title input renames the group', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    const titleInput = screen.getByLabelText('組別名稱') as HTMLInputElement;
    await user.clear(titleInput);
    await user.type(titleInput, 'Custom title');
    expect(screen.getByTestId('first-group-title').textContent).toBe('Custom title');
  });

  it('confirming the delete dialog removes the group', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    expect(screen.getByTestId('group-count').textContent).toBe('1');
    await user.click(screen.getByLabelText('刪除組別'));
    expect(screen.getByTestId('group-count').textContent).toBe('0');
  });

  it('cancelling the delete dialog keeps the group', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    await user.click(screen.getByLabelText('刪除組別'));
    expect(screen.getByTestId('group-count').textContent).toBe('1');
  });
});

describe('GroupsSection — catalog picker', () => {
  it('opens the picker, lists items, and adds the clicked item to the group', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    await user.click(screen.getByRole('button', { name: /新增標準品/ }));

    const dialog = await screen.findByRole('dialog', { name: '新增標準品' });
    expect(within(dialog).getByPlaceholderText(/搜尋/)).toBeInTheDocument();

    // Filter to a known item
    await user.type(within(dialog).getByPlaceholderText(/搜尋/), '立體');
    const item = within(dialog)
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('立體'));
    expect(item).toBeTruthy();
    await user.click(item!);

    expect(screen.getByTestId('first-group-items').textContent).toBe('1');
    // qty defaults to 1; unitPrice from price_standard 12000 → amount 12000
    expect(screen.getByTestId('first-item-amount').textContent).toBe('12000');
  });

  it('the cancel button closes the picker without adding', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    await user.click(screen.getByRole('button', { name: /新增標準品/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增標準品' });
    await user.click(within(dialog).getByLabelText('取消'));
    expect(screen.queryByRole('dialog', { name: '新增標準品' })).toBeNull();
    expect(screen.getByTestId('first-group-items').textContent).toBe('0');
  });
});

describe('GroupsSection — manual item entry', () => {
  it('rejects empty name and shows alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.click(within(dialog).getByRole('button', { name: '加入' }));
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('品項名稱'));
    expect(screen.getByTestId('first-group-items').textContent).toBe('0');
  });

  it('adds a fully-typed manual item', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.type(within(dialog).getByLabelText('副品項'), '客製化');
    await user.type(within(dialog).getByLabelText('品項名稱'), '一次性 Logo 設計');
    await user.type(within(dialog).getByLabelText('單位'), '式');
    await user.type(within(dialog).getByLabelText('單價'), '5000');
    await user.click(within(dialog).getByRole('button', { name: '加入' }));
    expect(screen.getByTestId('first-group-items').textContent).toBe('1');
    expect(screen.getByTestId('first-item-amount').textContent).toBe('5000');
  });
});

describe('GroupsSection — item editing', () => {
  it('updates qty and recomputes the row amount', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.type(within(dialog).getByLabelText('品項名稱'), 'A');
    await user.type(within(dialog).getByLabelText('單價'), '100');
    await user.click(within(dialog).getByRole('button', { name: '加入' }));

    const qtyInput = screen.getByLabelText('數量') as HTMLInputElement;
    await user.clear(qtyInput);
    await user.type(qtyInput, '7');
    // NumberInput commits on blur (Codex C1 — preserves intermediate `0.`)
    await user.tab();
    expect(screen.getByTestId('first-item-amount').textContent).toBe('700');
  });

  it('preserves fractional qty entered as 0.5 (Codex C1 regression test)', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.type(within(dialog).getByLabelText('品項名稱'), 'half day');
    await user.type(within(dialog).getByLabelText('單價'), '1000');
    await user.click(within(dialog).getByRole('button', { name: '加入' }));

    const qtyInput = screen.getByLabelText('數量') as HTMLInputElement;
    await user.clear(qtyInput);
    await user.type(qtyInput, '0.5');
    // While focused the dot survives — NOT collapsed to 0
    expect(qtyInput.value).toBe('0.5');
    await user.tab();
    // After blur: parseFloat('0.5') = 0.5 → amount = 500 (not 5000)
    expect(screen.getByTestId('first-item-amount').textContent).toBe('500');
  });

  it('renaming the first group to non-A-N text keeps next + 新增組 at A-2 (Codex C2)', async () => {
    const { user } = mount();
    const addBtn = screen.getByRole('button', { name: '+ 新增組' });
    await user.click(addBtn);
    expect(screen.getByTestId('first-group-title').textContent).toMatch(/^A-1．/);

    // Remove the A-1 prefix via rename
    const titleInput = screen.getByLabelText('組別名稱') as HTMLInputElement;
    await user.clear(titleInput);
    await user.type(titleInput, '設計費');
    expect(screen.getByTestId('first-group-title').textContent).toBe('設計費');

    // Next + 新增組 must NOT collide back to A-1
    await user.click(addBtn);
    const titles = screen.getAllByLabelText('組別名稱').map((el) => (el as HTMLInputElement).value);
    expect(titles).toContain('設計費');
    expect(titles.some((t) => t.startsWith('A-2'))).toBe(true);
    expect(titles.filter((t) => t.startsWith('A-1')).length).toBe(0);
  });

  it('removing an item clears it from state', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.type(within(dialog).getByLabelText('品項名稱'), 'A');
    await user.click(within(dialog).getByRole('button', { name: '加入' }));
    expect(screen.getByTestId('first-group-items').textContent).toBe('1');
    await user.click(screen.getByLabelText('移除品項'));
    expect(screen.getByTestId('first-group-items').textContent).toBe('0');
  });
});
