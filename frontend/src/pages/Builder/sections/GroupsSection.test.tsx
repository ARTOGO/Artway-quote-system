// GroupsSection — Session 2 behaviour tests.
//
// Focus: state mutations propagate correctly + UI affordances exist.
// SCSS / pixel-parity is not in scope (visual diff covered manually).
//
// Baseline note: createBlankQuote() now seeds ONE starter group
// `A-1．（請輸入組別名稱）` (legacy parity — newQuote → addQuoteGroup), so a
// fresh quote already shows one empty group. Item tests therefore operate on
// that starter group directly instead of adding one first.

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearCatalogCache } from '../../../api/items';
import type { CatalogItem } from '../../../lib/itemsCatalog';
import { QuoteProvider, useQuoteState } from '../../../state/QuoteContext';
import { createBlankQuote } from '../../../state/quoteReducer';
import { GroupsSection, catalogItemFields } from './GroupsSection';

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

// CatalogPicker fetches the live Google catalog on open; in tests we force
// that fetch to fail so the picker falls back to the bundled fixture (the
// A展間系統 A-1~A-7 structure the tests assert against) — no real network.
beforeEach(() => {
  clearCatalogCache();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in tests'))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Drives the cascading catalog picker (大品項 → 副品項 → 品項名稱 → 加入).
// Defaults to A展間系統 / A-1_實境展間 2.0 / first item (標準型, 12000 / 9600).
async function pickCatalog(
  user: ReturnType<typeof userEvent.setup>,
  opts: { group?: string; sub?: string; nameIndex?: number } = {},
): Promise<void> {
  const { group = 'A展間系統', sub = 'A-1_實境展間 2.0', nameIndex = 0 } = opts;
  await user.click(screen.getAllByRole('button', { name: /新增標準品/ })[0]);
  const dialog = await screen.findByRole('dialog', { name: '新增標準品' });
  await user.selectOptions(within(dialog).getByLabelText('大品項'), group);
  await user.selectOptions(within(dialog).getByLabelText('副品項'), sub);
  await user.selectOptions(within(dialog).getByLabelText('品項名稱'), String(nameIndex));
  await user.click(within(dialog).getByRole('button', { name: '加入' }));
}

describe('GroupsSection — group lifecycle', () => {
  it('starts with one seeded starter group titled A-1 (no empty hint)', () => {
    mount();
    expect(screen.getByTestId('group-count').textContent).toBe('1');
    expect(screen.getByTestId('first-group-title').textContent).toMatch(/^A-1．/);
    expect(screen.queryByText(/按上方「\+ 新增組」開始/)).not.toBeInTheDocument();
  });

  it('clicking "+ 新增組" adds a second group (A-2)', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    expect(screen.getByTestId('group-count').textContent).toBe('2');
    const titles = screen.getAllByLabelText('組別名稱').map((el) => (el as HTMLInputElement).value);
    expect(titles.some((t) => t.startsWith('A-2'))).toBe(true);
  });

  it('subsequent "+ 新增組" clicks keep incrementing the count', async () => {
    const { user } = mount();
    const addBtn = screen.getByRole('button', { name: '+ 新增組' });
    await user.click(addBtn);
    await user.click(addBtn);
    await user.click(addBtn);
    // 1 starter + 3 added = 4
    expect(screen.getByTestId('group-count').textContent).toBe('4');
  });

  it('typing into the starter group title input renames it', async () => {
    const { user } = mount();
    const titleInput = screen.getByLabelText('組別名稱') as HTMLInputElement;
    await user.clear(titleInput);
    await user.type(titleInput, 'Custom title');
    expect(screen.getByTestId('first-group-title').textContent).toBe('Custom title');
  });

  it('confirming the delete dialog removes the only group → empty hint returns', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = mount();
    expect(screen.getByTestId('group-count').textContent).toBe('1');
    await user.click(screen.getByLabelText('刪除組別'));
    expect(screen.getByTestId('group-count').textContent).toBe('0');
    expect(screen.getByText(/按上方「\+ 新增組」開始/)).toBeInTheDocument();
  });

  it('cancelling the delete dialog keeps the group', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = mount();
    await user.click(screen.getByLabelText('刪除組別'));
    expect(screen.getByTestId('group-count').textContent).toBe('1');
  });
});

describe('GroupsSection — catalog picker', () => {
  it('cascades 大品項 → 副品項 → 品項名稱 and adds the picked item', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: /新增標準品/ }));
    const dialog = await screen.findByRole('dialog', { name: '新增標準品' });

    // 副品項 / 品項名稱 start disabled until the parent level is chosen.
    expect(within(dialog).getByLabelText('副品項')).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('大品項'), 'A展間系統');
    expect(within(dialog).getByLabelText('副品項')).toBeEnabled();
    await user.selectOptions(within(dialog).getByLabelText('副品項'), 'A-1_實境展間 2.0');
    await user.selectOptions(within(dialog).getByLabelText('品項名稱'), '0');
    await user.click(within(dialog).getByRole('button', { name: '加入' }));

    expect(screen.getByTestId('first-group-items').textContent).toBe('1');
    // qty defaults to 1; unitPrice from price_standard 12000 → amount 12000
    expect(screen.getByTestId('first-item-amount').textContent).toBe('12000');
  });

  it('the cancel button closes the picker without adding', async () => {
    const { user } = mount();
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
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.click(within(dialog).getByRole('button', { name: '加入' }));
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('品項名稱'));
    expect(screen.getByTestId('first-group-items').textContent).toBe('0');
  });

  it('adds a fully-typed manual item', async () => {
    const { user } = mount();
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

  it('renaming the starter group to non-A-N text keeps next + 新增組 at A-2 (Codex C2)', async () => {
    const { user } = mount();
    // Starter group is A-1 already.
    expect(screen.getByTestId('first-group-title').textContent).toMatch(/^A-1．/);

    // Remove the A-1 prefix via rename
    const titleInput = screen.getByLabelText('組別名稱') as HTMLInputElement;
    await user.clear(titleInput);
    await user.type(titleInput, '設計費');
    expect(screen.getByTestId('first-group-title').textContent).toBe('設計費');

    // Next + 新增組 must NOT collide back to A-1 (immutable seq → A-2)
    await user.click(screen.getByRole('button', { name: '+ 新增組' }));
    const titles = screen.getAllByLabelText('組別名稱').map((el) => (el as HTMLInputElement).value);
    expect(titles).toContain('設計費');
    expect(titles.some((t) => t.startsWith('A-2'))).toBe(true);
    expect(titles.filter((t) => t.startsWith('A-1')).length).toBe(0);
  });

  it('removing an item clears it from state', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.type(within(dialog).getByLabelText('品項名稱'), 'A');
    await user.click(within(dialog).getByRole('button', { name: '加入' }));
    expect(screen.getByTestId('first-group-items').textContent).toBe('1');
    await user.click(screen.getByLabelText('移除品項'));
    expect(screen.getByTestId('first-group-items').textContent).toBe('0');
  });
});

describe('GroupsSection — Discount column (Session 2.5)', () => {
  it('toggling "顯示 Discount 折扣欄位" reveals the per-item 折扣 field + auto toggle', async () => {
    const { user } = mount();
    // Add a manual item first so the discount field has a row to attach to.
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.type(within(dialog).getByLabelText('品項名稱'), 'A');
    await user.type(within(dialog).getByLabelText('單價'), '1000');
    await user.click(within(dialog).getByRole('button', { name: '加入' }));

    // No discount field until the toggle is on.
    expect(screen.queryByLabelText('折扣')).toBeNull();
    await user.click(screen.getByLabelText(/顯示 Discount 折扣欄位/));
    expect(screen.getByLabelText('折扣')).toBeInTheDocument();
    // Auto-discount toggle appears only once the column is shown.
    expect(screen.getByLabelText(/使用折扣/)).toBeInTheDocument();
  });

  it('entering a discount reduces the row amount', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.type(within(dialog).getByLabelText('品項名稱'), 'A');
    await user.type(within(dialog).getByLabelText('單價'), '1000');
    await user.click(within(dialog).getByRole('button', { name: '加入' }));
    // qty defaults to 1 → amount 1000
    expect(screen.getByTestId('first-item-amount').textContent).toBe('1000');

    await user.click(screen.getByLabelText(/顯示 Discount 折扣欄位/));
    const discount = screen.getByLabelText('折扣') as HTMLInputElement;
    await user.clear(discount);
    await user.type(discount, '300');
    await user.tab(); // NumberInput commits on blur
    // The shared Probe's `first-item-amount` is raw qty×price (no discount),
    // so assert on the rendered row amount: 1000 − 300 = 700 (shown for both
    // the item row and the now-700 subtotal).
    expect(screen.getAllByText('NT$ 700').length).toBeGreaterThan(0);
  });
});

describe('GroupsSection — Adjustment row (Session 2.5)', () => {
  it('toggling 議價/手續費 reveals the label + amount fields', async () => {
    const { user } = mount();
    expect(screen.queryByLabelText('金額異動名稱')).toBeNull();
    await user.click(screen.getByLabelText(/最後金額異動/));
    expect(screen.getByLabelText('金額異動名稱')).toBeInTheDocument();
    expect(screen.getByLabelText('金額異動金額')).toBeInTheDocument();
  });
});

describe('GroupsSection — item operations (Session 4b)', () => {
  it('repick (⟲) reopens the catalog and replaces the item in place', async () => {
    const { user } = mount();
    await pickCatalog(user); // A-1 標準型, 12000
    expect(screen.getByTestId('first-group-items').textContent).toBe('1');
    expect(screen.getByTestId('first-item-amount').textContent).toBe('12000');

    // Click the repick button → catalog reopens in 重新選擇 mode
    await user.click(screen.getByLabelText('重新選擇此品項'));
    const dialog = await screen.findByRole('dialog', { name: '重新選擇品項' });
    // Pick a different item (C設計系統 / C-1_平面設計 / 主視覺一套, 30000)
    await user.selectOptions(within(dialog).getByLabelText('大品項'), 'C設計系統');
    await user.selectOptions(within(dialog).getByLabelText('副品項'), 'C-1_平面設計');
    await user.selectOptions(within(dialog).getByLabelText('品項名稱'), '0');
    await user.click(within(dialog).getByRole('button', { name: '替換' }));

    // Still one item, but price replaced (qty preserved at 1)
    expect(screen.getByTestId('first-group-items').textContent).toBe('1');
    expect(screen.getByTestId('first-item-amount').textContent).toBe('30000');
  });

  it('tier switch flips 定價 → 優惠價 and updates the unit price', async () => {
    const { user } = mount();
    await pickCatalog(user); // A-1 標準型, 12000 / 9600
    expect(screen.getByTestId('first-item-amount').textContent).toBe('12000');
    const tier = screen.getByRole('switch', { name: '切換 定價 / 優惠價' });
    expect(tier).toHaveAttribute('aria-checked', 'false');
    await user.click(tier);
    // 優惠價 9600
    expect(tier).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('first-item-amount').textContent).toBe('9600');
  });

  it('tier switch is disabled while auto-discount is on', async () => {
    const { user } = mount();
    await pickCatalog(user);
    await user.click(screen.getByLabelText(/顯示 Discount 折扣欄位/));
    await user.click(screen.getByLabelText(/使用折扣/));
    expect(screen.getByRole('switch', { name: '切換 定價 / 優惠價' })).toBeDisabled();
  });

  it('adding a catalog item to an auto-discount group applies the discount (Codex P2 #1)', async () => {
    const { user } = mount();
    // Enable Discount + auto-discount on the (empty) starter group FIRST.
    await user.click(screen.getByLabelText(/顯示 Discount 折扣欄位/));
    await user.click(screen.getByLabelText(/使用折扣/));
    // Now add A-1 標準型 (定價 12000 / 優惠價 9600).
    await pickCatalog(user);
    // The freshly-added row must already carry the price gap, not full price.
    expect((screen.getByLabelText('折扣') as HTMLInputElement).value).toBe('2400');
  });

  it('manual items have no repick button or tier switch', async () => {
    const { user } = mount();
    await user.click(screen.getByRole('button', { name: /手動新增/ }));
    const dialog = await screen.findByRole('dialog', { name: '手動新增品項' });
    await user.type(within(dialog).getByLabelText('品項名稱'), '客製');
    await user.click(within(dialog).getByRole('button', { name: '加入' }));
    expect(screen.queryByLabelText('重新選擇此品項')).toBeNull();
    expect(screen.queryByRole('switch', { name: '切換 定價 / 優惠價' })).toBeNull();
  });

  it('副品項 and 品項名稱 are editable textareas (legacy parity)', async () => {
    const { user } = mount();
    await pickCatalog(user);
    const cat = screen.getByLabelText('副品項') as HTMLTextAreaElement;
    const name = screen.getByLabelText('品項名稱') as HTMLTextAreaElement;
    expect(cat.value).toBe('A-1_實境展間 2.0');
    expect(name.value).toMatch(/標準型/);
    // Edit both
    await user.clear(name);
    await user.type(name, '客製 AR 方案');
    expect((screen.getByLabelText('品項名稱') as HTMLTextAreaElement).value).toBe('客製 AR 方案');
    await user.clear(cat);
    await user.type(cat, 'X-9');
    expect((screen.getByLabelText('副品項') as HTMLTextAreaElement).value).toBe('X-9');
  });

  // Removed: ↑↓ reorder buttons were dropped from the UI (drag handle is the
  // only reorder affordance now — see drag-reorder test below).

  it('drag-reorder moves an item (regression: dataTransfer.setData must fire)', async () => {
    const { user } = mount();
    // Add two distinct catalog items: A-1 標準型 then B-1 單頁版.
    await pickCatalog(user);
    await pickCatalog(user, { group: 'B網站系統', sub: 'B-1_形象網站', nameIndex: 0 });

    const namesOf = () =>
      (screen.getAllByLabelText('品項名稱') as HTMLTextAreaElement[]).map((t) => t.value);
    expect(namesOf()[0]).toMatch(/標準型/);

    // Simulate the HTML5 drag of item[1]'s handle onto item[0]'s row.
    const handles = screen.getAllByLabelText('拖曳調整順序');
    const dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(() => '1'),
      effectAllowed: '',
      dropEffect: '',
    };
    const row0 = handles[0].closest('[class*="itemRow"]')!;
    fireEvent.dragStart(handles[1], { dataTransfer });
    fireEvent.dragOver(row0, { dataTransfer });
    fireEvent.drop(row0, { dataTransfer });

    // dataTransfer.setData MUST be called or the real browser drag is invalid.
    expect(dataTransfer.setData).toHaveBeenCalled();
    expect(namesOf()[0]).toMatch(/單頁版/);
    expect(namesOf()[1]).toMatch(/標準型/);
  });
});

// Codex round-3 P2: a catalog row with a missing price tier (blank standard or
// blank arts) must NOT carry that tier as 0. Legacy stores it as null
// (legacy.html:2838) so the tier-switch guard (`price != null`) keeps the
// current price instead of zeroing the row to NT$0 when the user toggles to the
// absent tier. catalogItemFields must therefore store the absent tier as
// `undefined`, not 0.
describe('catalogItemFields — absent price tier (Codex round-3 P2)', () => {
  const base = {
    group: 'A展間系統',
    sub_group: 'B-3_隨身導覽系統',
    name: '隨身導覽系統｜短期方案',
    unit: '/式',
    service_description: '',
  };

  it('arts-only row (blank standard) → priceStandard undefined, defaults to 優惠價', () => {
    const cat: CatalogItem = { ...base, price_standard: 0, price_arts: 12500 };
    const f = catalogItemFields(cat);
    expect(f.priceStandard).toBeUndefined(); // NOT 0 — toggling to 定價 would zero it
    expect(f.priceArts).toBe(12500);
    expect(f.priceTier).toBe('price_arts');
    expect(f.unitPrice).toBe(12500);
  });

  it('standard-only row (blank arts) → priceArts undefined (reverse direction)', () => {
    const cat: CatalogItem = { ...base, price_standard: 30000, price_arts: 0 };
    const f = catalogItemFields(cat);
    expect(f.priceStandard).toBe(30000);
    expect(f.priceArts).toBeUndefined(); // toggling to 優惠價 must not zero it
    expect(f.priceTier).toBe('price_standard');
    expect(f.unitPrice).toBe(30000);
  });

  it('both tiers present → both carried as numbers, defaults to 定價', () => {
    const cat: CatalogItem = { ...base, price_standard: 12000, price_arts: 9600 };
    const f = catalogItemFields(cat);
    expect(f.priceStandard).toBe(12000);
    expect(f.priceArts).toBe(9600);
    expect(f.priceTier).toBe('price_standard');
    expect(f.unitPrice).toBe(12000);
  });

  it('auto-discount on a standard-only row keeps discount 0 (no NT$0 line, Codex round-4 P1)', () => {
    // A standard-only row has no 優惠價, so applyAutoDiscount must leave the
    // discount at 0 — not `ps − 0`, which would zero the whole line.
    const cat: CatalogItem = { ...base, price_standard: 30000, price_arts: 0 };
    const f = catalogItemFields(cat, /* autoDiscount */ true);
    expect(f.priceTier).toBe('price_standard');
    expect(f.unitPrice).toBe(30000);
    expect(f.discount).toBe(0); // legacy: isNaN(pa) ? 0 : max(0, ps−pa)
  });

  it('auto-discount on a standard+arts row applies the price gap', () => {
    const cat: CatalogItem = { ...base, price_standard: 12000, price_arts: 9600 };
    const f = catalogItemFields(cat, /* autoDiscount */ true);
    expect(f.unitPrice).toBe(12000);
    expect(f.discount).toBe(2400); // 12000 − 9600
  });
});

// Codex round-5 P2: the item-carried service_description is a cache of the
// catalog row captured at add time. Editing the 副品項 (sub_group) must clear
// it, or syncServices would print the OLD category's appendix under the new
// label. Legacy re-derives the description from the catalog by sub_group
// (legacy.html:2354) — a manually-typed category yields empty.
describe('副品項 edit clears stale service_description (Codex round-5 P2)', () => {
  function DescProbe(): React.ReactElement {
    const { state } = useQuoteState();
    return (
      <span data-testid="first-item-desc">
        {state.groups[0]?.items[0]?.service_description ?? ''}
      </span>
    );
  }

  function seedWithDescribedItem() {
    const base = createBlankQuote();
    return {
      ...base,
      groups: [
        {
          ...base.groups[0],
          items: [
            {
              id: 'it-1',
              sub_group: 'A-1_實境展間 2.0',
              name: '【2.0】L1',
              unit: '/式',
              qty: 1,
              unitPrice: 12000,
              service_description: '【拍攝規格】\n720° 環物',
            },
          ],
        },
      ],
    };
  }

  it('editing the 副品項 textarea wipes the carried service_description', () => {
    render(
      <QuoteProvider initial={seedWithDescribedItem()}>
        <GroupsSection />
        <DescProbe />
      </QuoteProvider>,
    );
    // Precondition: the seeded item carries the A-1 appendix description.
    expect(screen.getByTestId('first-item-desc').textContent).toContain('拍攝規格');

    // Retype the category → the stale description must be cleared.
    fireEvent.change(screen.getByLabelText('副品項'), {
      target: { value: 'B-1_主題策展頁' },
    });
    expect(screen.getByTestId('first-item-desc').textContent).toBe('');
  });
});
