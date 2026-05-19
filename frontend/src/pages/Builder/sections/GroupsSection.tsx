// 報價內容 (Quote Groups) — Session 2 deliverable.
//
// Legacy ref: legacy.html line 1839-1846 (.bp-section #bpGroups), 2559-2860
// (addQuoteGroup / renderGroupBuilder / openPicker / openManualPicker).
//
// Session 2 scope (70% of legacy parity):
//   ✓ add / remove / rename groups
//   ✓ add items via picker (10-item fixture via lib/itemsCatalog)
//   ✓ add items via manual form (sub_group / name / unit / qty / unitPrice)
//   ✓ edit qty + unitPrice inline; remove items
//   ✓ subtotal / tax / group total displayed live
//   ✗ Discount column toggle (Session 2.5)
//   ✗ Auto-discount (priceStandard − priceArts) (Session 2.5)
//   ✗ Adjustment (議價 / 手續費) row (Session 2.5)
//   ✗ Reorder up/down (Session 2.5)
//   ✗ Real items catalog API (PR 5 — needs new backend endpoint)
//
// Picker UX intentionally inline (vs Radix Popover) for Session 2 minimum;
// Session 4 (Radix Modals batch) will upgrade.

import { useState, type JSX } from 'react';

import { Button } from '../../../components/Button/Button';
import { NumberInput } from '../../../components/NumberInput/NumberInput';
import { groupTitleFor, newGroupId, newItemId, nextGroupSeq } from '../../../lib/groupId';
import { ITEMS_CATALOG_FIXTURE, searchItems, type CatalogItem } from '../../../lib/itemsCatalog';
import {
  calcGroupSubtotal,
  calcGroupTax,
  calcGroupTotal,
  calcItemAmount,
  formatMoney,
} from '../../../lib/quoteCalc';
import { useQuoteState } from '../../../state/QuoteContext';
import type { QuoteGroup, QuoteItem } from '../../../state/quoteTypes';
import { BPSection } from '../../../components/BPSection/BPSection';
import styles from './GroupsSection.module.scss';

export function GroupsSection(): JSX.Element {
  const { state, addGroup, removeGroup, renameGroup } = useQuoteState();
  const groups = state.groups;

  function handleAddGroup(): void {
    // C2 fix: use immutable `seq` (max+1) rather than regex-extracting from
    // the editable title. A user renaming "A-1 ..." → "設計費" no longer
    // collapses the next + 新增組 back to A-1.
    const seq = nextGroupSeq(groups);
    addGroup({ id: newGroupId(), seq, title: groupTitleFor(seq), items: [] });
  }

  function handleRemoveGroup(gid: string): void {
    if (!window.confirm('確定刪除這組報價？')) return;
    removeGroup(gid);
  }

  return (
    <BPSection
      title="報價內容"
      action={
        <button type="button" className={styles.miniBtn} onClick={handleAddGroup}>
          + 新增組
        </button>
      }
    >
      {groups.length === 0 && <div className={styles.empty}>（按上方「+ 新增組」開始）</div>}
      {groups.map((g) => (
        <GroupCard
          key={g.id}
          group={g}
          onRename={(title) => renameGroup(g.id, title)}
          onRemove={() => handleRemoveGroup(g.id)}
        />
      ))}
    </BPSection>
  );
}

// ─── GroupCard ─────────────────────────────────────────────────────────────

interface GroupCardProps {
  group: QuoteGroup;
  onRename: (title: string) => void;
  onRemove: () => void;
}

function GroupCard({ group, onRename, onRemove }: GroupCardProps): JSX.Element {
  const { addItem, removeItem, updateItem } = useQuoteState();
  const [openPicker, setOpenPicker] = useState<'standard' | 'manual' | null>(null);

  function handleAddFromCatalog(catItem: CatalogItem): void {
    const newItem: QuoteItem = {
      id: newItemId(),
      sub_group: catItem.sub_group,
      name: catItem.name,
      unit: catItem.unit,
      qty: 1,
      unitPrice: catItem.price_standard,
      priceTier: 'price_standard',
    };
    addItem(group.id, newItem);
    setOpenPicker(null);
  }

  function handleAddManual(item: Omit<QuoteItem, 'id'>): void {
    addItem(group.id, { id: newItemId(), ...item });
    setOpenPicker(null);
  }

  const subtotal = calcGroupSubtotal(group);
  const tax = calcGroupTax(subtotal);
  const total = calcGroupTotal(group);

  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <input
          type="text"
          className={styles.titleInput}
          value={group.title}
          onChange={(e) => onRename(e.target.value)}
          placeholder="A-1．組別名稱"
          aria-label="組別名稱"
        />
        <button
          type="button"
          className={styles.removeGroup}
          onClick={onRemove}
          aria-label="刪除組別"
          title="刪除組別"
        >
          ✕
        </button>
      </div>

      <div className={styles.items}>
        {group.items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            hasDiscount={false}
            onUpdate={(patch) => updateItem(group.id, it.id, patch)}
            onRemove={() => removeItem(group.id, it.id)}
          />
        ))}
        {group.items.length === 0 && openPicker === null && (
          <div className={styles.emptyItems}>（尚未加入品項）</div>
        )}
      </div>

      {openPicker === null ? (
        <div className={styles.addRow}>
          <button type="button" className={styles.addBtn} onClick={() => setOpenPicker('standard')}>
            ＋ 新增標準品
          </button>
          <button type="button" className={styles.addBtn} onClick={() => setOpenPicker('manual')}>
            ＋ 手動新增
          </button>
        </div>
      ) : openPicker === 'standard' ? (
        <CatalogPicker onCancel={() => setOpenPicker(null)} onPick={handleAddFromCatalog} />
      ) : (
        <ManualPicker onCancel={() => setOpenPicker(null)} onAdd={handleAddManual} />
      )}

      <div className={styles.totals}>
        <div className={styles.totalsRow}>
          <span>小計 Subtotal</span>
          <span>NT$ {formatMoney(subtotal)}</span>
        </div>
        <div className={styles.totalsRow}>
          <span>營業稅 Tax 5%</span>
          <span>NT$ {formatMoney(tax)}</span>
        </div>
        <div className={styles.totalsGrand}>
          <span>{group.title}　總價</span>
          <span>NT$ {formatMoney(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── ItemRow ──────────────────────────────────────────────────────────────

interface ItemRowProps {
  item: QuoteItem;
  hasDiscount: boolean;
  onUpdate: (patch: Partial<Omit<QuoteItem, 'id'>>) => void;
  onRemove: () => void;
}

function ItemRow({ item, onUpdate, onRemove }: ItemRowProps): JSX.Element {
  const amount = calcItemAmount(item);
  return (
    <div className={styles.itemRow}>
      <div className={styles.itemTop}>
        <span className={styles.itemSubGroup}>{item.sub_group || '—'}</span>
        <span className={styles.itemName} title={item.name}>
          {item.name}
        </span>
        <button
          type="button"
          className={styles.itemRemove}
          onClick={onRemove}
          aria-label="移除品項"
          title="移除品項"
        >
          ✕
        </button>
      </div>
      <div className={styles.itemFields}>
        <label className={styles.miniField}>
          <span>數量</span>
          <NumberInput value={item.qty} onCommit={(qty) => onUpdate({ qty })} aria-label="數量" />
        </label>
        <label className={styles.miniField}>
          <span>單位</span>
          <input
            type="text"
            value={item.unit}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            aria-label="單位"
          />
        </label>
        <label className={styles.miniField}>
          <span>單價</span>
          <NumberInput
            value={item.unitPrice}
            // Round to integer NTD on commit (Gemini G3): money fields
            // never carry fractional cents in the quote.
            onCommit={(unitPrice) => onUpdate({ unitPrice: Math.round(unitPrice) })}
            aria-label="單價"
          />
        </label>
        <span className={styles.itemAmount}>NT$ {formatMoney(amount)}</span>
      </div>
    </div>
  );
}

// ─── CatalogPicker ────────────────────────────────────────────────────────

function CatalogPicker({
  onCancel,
  onPick,
}: {
  onCancel: () => void;
  onPick: (item: CatalogItem) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const results = searchItems(query, ITEMS_CATALOG_FIXTURE);
  return (
    <div className={styles.picker} role="dialog" aria-label="新增標準品">
      <div className={styles.pickerHead}>
        <span>新增標準品（{results.length}）</span>
        <button type="button" className={styles.pickerCancel} onClick={onCancel} aria-label="取消">
          ✕
        </button>
      </div>
      <input
        type="text"
        className={styles.pickerSearch}
        placeholder="搜尋名稱 / 副品項 / 單位…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className={styles.pickerList}>
        {results.length === 0 ? (
          <div className={styles.pickerEmpty}>（無符合品項）</div>
        ) : (
          results.map((it) => (
            <button
              key={`${it.sub_group}-${it.name}`}
              type="button"
              className={styles.pickerItem}
              onClick={() => onPick(it)}
            >
              <span className={styles.pickerItemCat}>{it.sub_group}</span>
              <span className={styles.pickerItemName}>{it.name}</span>
              <span className={styles.pickerItemPrice}>
                NT$ {formatMoney(it.price_standard)} / {it.unit}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ─── ManualPicker ─────────────────────────────────────────────────────────

function ManualPicker({
  onCancel,
  onAdd,
}: {
  onCancel: () => void;
  onAdd: (item: Omit<QuoteItem, 'id'>) => void;
}): JSX.Element {
  const [sub, setSub] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');

  function submit(): void {
    if (name.trim() === '') {
      window.alert('請至少填寫「品項名稱」');
      return;
    }
    onAdd({
      sub_group: sub.trim(),
      name: name.trim(),
      unit: unit.trim(),
      qty: 1,
      unitPrice: Math.round(parseFloat(price) || 0), // integer NTD (Gemini G4)
      priceTier: 'manual',
    });
  }

  return (
    <div className={styles.picker} role="dialog" aria-label="手動新增品項">
      <div className={styles.pickerHead}>
        <span>手動新增</span>
        <button type="button" className={styles.pickerCancel} onClick={onCancel} aria-label="取消">
          ✕
        </button>
      </div>
      <label className={styles.miniField}>
        <span>副品項</span>
        <input
          type="text"
          value={sub}
          onChange={(e) => setSub(e.target.value)}
          placeholder="例：客製化、設計、雜支"
          aria-label="副品項"
        />
      </label>
      <label className={styles.miniField}>
        <span>名稱</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="自由輸入完整說明"
          aria-label="品項名稱"
          autoFocus
        />
      </label>
      <div className={styles.miniRow}>
        <label className={styles.miniField}>
          <span>單位</span>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="式 / 件 / 場"
            aria-label="單位"
          />
        </label>
        <label className={styles.miniField}>
          <span>單價</span>
          <input
            type="number"
            min={0}
            step={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            aria-label="單價"
          />
        </label>
      </div>
      <Button variant="primary" onClick={submit} className={styles.manualSubmit}>
        加入
      </Button>
    </div>
  );
}
