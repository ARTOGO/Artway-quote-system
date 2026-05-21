// 報價內容 (Quote Groups) — Session 2 deliverable.
//
// Legacy ref: legacy.html line 1839-1846 (.bp-section #bpGroups), 2559-2860
// (addQuoteGroup / renderGroupBuilder / openPicker / openManualPicker).
//
// Implemented (legacy parity):
//   ✓ add / remove / rename groups
//   ✓ cascading 大品項→副品項→品項名稱 picker over the LIVE Google catalog
//     (useItemsCatalog → api/items, fixture fallback) + manual entry
//   ✓ editable 副品項 / 品項名稱 / qty / unit / unitPrice; remove items
//   ✓ Discount column + auto-discount (priceStandard − priceArts)
//   ✓ Adjustment (議價 / 手續費) row
//   ✓ reorder via ↑↓ buttons + drag handle; repick (⟲); 定價/優惠價 tier switch
//   ✓ subtotal / tax / adjustment / group total displayed live
//
// Picker UX is inline (vs Radix Popover); a Radix upgrade is optional polish.

import { useState, type JSX } from 'react';

import { Button } from '../../../components/Button/Button';
import { NumberInput } from '../../../components/NumberInput/NumberInput';
import { groupTitleFor, newGroupId, newItemId, nextGroupSeq } from '../../../lib/groupId';
import {
  itemsInSubGroup,
  listGroups,
  listSubGroups,
  type CatalogItem,
} from '../../../lib/itemsCatalog';
import { useItemsCatalog } from '../../../lib/useItemsCatalog';
import {
  calcGroupAdjustment,
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
      title="01 專案報價內容"
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

// Catalog fields carried onto an item — shared by add + repick so both paths
// stay in sync.
//   - Default tier: 定價 (price_standard). When a row has no valid standard
//     price but has an arts price, fall back to 優惠價 (legacy buildPicker
//     line 2824-2829) so it isn't quoted at NT$0 (Codex P2 #4).
//   - When the group auto-discounts, list price + auto price-gap, matching
//     legacy applyAutoDiscount; skips rows without a valid standard price
//     (Codex P2 #1).
//   - Carries the per-tier prices, but stores a missing/blank price as
//     `undefined` (NOT 0), mirroring legacy `_priceStandard: isNaN(ps)?null:ps`
//     (legacy.html line 2838-2839). The tier switch's guard then skips the
//     unitPrice update for an absent tier instead of zeroing the row to NT$0
//     (Codex round-3 P2).
export function catalogItemFields(
  catItem: CatalogItem,
  autoDiscount = false,
): Omit<QuoteItem, 'id' | 'qty'> {
  const ps = catItem.price_standard;
  const pa = catItem.price_arts;
  const hasStandard = ps > 0;
  const hasArts = pa > 0;
  let priceTier = hasStandard ? 'price_standard' : 'price_arts';
  let unitPrice = hasStandard ? ps : pa;
  let discount = 0;
  if (autoDiscount && hasStandard) {
    priceTier = 'price_standard';
    unitPrice = ps;
    // Auto price-gap only when an arts price exists. A standard-only row has
    // no 優惠價 to discount to, so discount stays 0 — matching legacy
    // applyAutoDiscount `isNaN(pa) ? 0 : max(0, ps−pa)` (legacy.html:2562) and
    // the SET_GROUP_AUTO_DISCOUNT reducer. Using `ps − 0` here would wrongly
    // discount the full price and zero the line to NT$0 (Codex round-4 P1).
    discount = hasArts ? Math.max(0, ps - pa) : 0;
  }
  return {
    sub_group: catItem.sub_group,
    name: catItem.name,
    unit: catItem.unit,
    unitPrice,
    priceTier,
    discount,
    service_description: catItem.service_description,
    priceStandard: hasStandard ? ps : undefined,
    priceArts: hasArts ? pa : undefined,
    isManual: false,
  };
}

function GroupCard({ group, onRename, onRemove }: GroupCardProps): JSX.Element {
  const {
    addItem,
    removeItem,
    updateItem,
    moveItem,
    setGroupDiscount,
    setGroupAutoDiscount,
    setGroupAdjustmentEnabled,
    setGroupAdjustment,
  } = useQuoteState();
  // 'standard' | 'manual' = add picker; { repick: itemId } = replace an item.
  const [openPicker, setOpenPicker] = useState<'standard' | 'manual' | { repick: string } | null>(
    null,
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const hasDiscount = group.hasDiscount ?? false;
  const hasAdjustment = group.hasAdjustment ?? false;
  const autoDiscount = group.autoDiscount ?? false;

  function handleAddFromCatalog(catItem: CatalogItem): void {
    addItem(group.id, { id: newItemId(), qty: 1, ...catalogItemFields(catItem, autoDiscount) });
    setOpenPicker(null);
  }

  function handleAddManual(item: Omit<QuoteItem, 'id'>): void {
    addItem(group.id, { id: newItemId(), ...item, isManual: true });
    setOpenPicker(null);
  }

  // Repick: replace the catalog fields of an existing item in place, keeping
  // its id + qty (legacy openRePicker, line 2676).
  function handleRepick(itemId: string, catItem: CatalogItem): void {
    updateItem(group.id, itemId, catalogItemFields(catItem, autoDiscount));
    setOpenPicker(null);
  }

  // Toggle 定價 ↔ 優惠價 for a non-manual item (legacy bp-tier-switch). Locked
  // when auto-discount drives the prices.
  function handleTierToggle(it: QuoteItem): void {
    if (autoDiscount || it.isManual) return;
    const toArts = it.priceTier !== 'price_arts';
    const nextPrice = toArts ? it.priceArts : it.priceStandard;
    updateItem(group.id, it.id, {
      priceTier: toArts ? 'price_arts' : 'price_standard',
      ...(nextPrice != null && !Number.isNaN(nextPrice) ? { unitPrice: nextPrice } : {}),
    });
  }

  const subtotal = calcGroupSubtotal(group);
  const tax = calcGroupTax(subtotal);
  const adjustment = calcGroupAdjustment(group);
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

      {/* 折扣 / 議價 選項 (Session 2.5) */}
      <div className={styles.groupOpts}>
        <label className={styles.groupOpt}>
          <input
            type="checkbox"
            checked={hasDiscount}
            onChange={(e) => setGroupDiscount(group.id, e.target.checked)}
          />
          <span>顯示 Discount 折扣欄位</span>
        </label>
        {hasDiscount && (
          <label className={styles.groupOpt}>
            <input
              type="checkbox"
              checked={group.autoDiscount ?? false}
              onChange={(e) => setGroupAutoDiscount(group.id, e.target.checked)}
            />
            <span>使用折扣：定價-優惠價</span>
          </label>
        )}
        <label className={styles.groupOpt}>
          <input
            type="checkbox"
            checked={hasAdjustment}
            onChange={(e) => setGroupAdjustmentEnabled(group.id, e.target.checked)}
          />
          <span>最後金額異動（議價 / 手續費）</span>
        </label>
        {hasAdjustment && (
          <div className={styles.adjustmentFields}>
            <input
              type="text"
              className={styles.adjLabel}
              value={group.adjustment?.label ?? ''}
              onChange={(e) => setGroupAdjustment(group.id, 'label', e.target.value)}
              placeholder="名稱（例：議價折讓 / 手續費）"
              aria-label="金額異動名稱"
            />
            <input
              type="number"
              step={1}
              className={styles.adjAmount}
              value={group.adjustment?.amount ?? ''}
              onChange={(e) => setGroupAdjustment(group.id, 'amount', e.target.value)}
              placeholder="金額（負數＝扣款）"
              aria-label="金額異動金額"
            />
          </div>
        )}
      </div>

      <div className={styles.items}>
        {group.items.map((it, idx) => (
          <ItemRow
            key={it.id}
            item={it}
            index={idx}
            total={group.items.length}
            hasDiscount={hasDiscount}
            autoDiscount={autoDiscount}
            isDragging={dragIndex === idx}
            onUpdate={(patch) => updateItem(group.id, it.id, patch)}
            onRemove={() => removeItem(group.id, it.id)}
            onRepick={() => setOpenPicker({ repick: it.id })}
            onTierToggle={() => handleTierToggle(it)}
            onMoveUp={() => moveItem(group.id, idx, idx - 1)}
            onMoveDown={() => moveItem(group.id, idx, idx + 1)}
            onDragStart={() => setDragIndex(idx)}
            onDragEnd={() => setDragIndex(null)}
            onDropOn={() => {
              if (dragIndex !== null && dragIndex !== idx) moveItem(group.id, dragIndex, idx);
              setDragIndex(null);
            }}
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
      ) : openPicker === 'manual' ? (
        <ManualPicker onCancel={() => setOpenPicker(null)} onAdd={handleAddManual} />
      ) : (
        <CatalogPicker
          repick
          onCancel={() => setOpenPicker(null)}
          onPick={(catItem) => handleRepick(openPicker.repick, catItem)}
        />
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
        {hasAdjustment && (adjustment !== 0 || (group.adjustment?.label ?? '') !== '') && (
          <div className={styles.totalsRow}>
            <span>{group.adjustment?.label || '金額異動 Adjustment'}</span>
            <span>
              {adjustment < 0 ? '−' : ''}NT$ {formatMoney(Math.abs(adjustment))}
            </span>
          </div>
        )}
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
  index: number;
  total: number;
  hasDiscount: boolean;
  autoDiscount: boolean;
  isDragging: boolean;
  onUpdate: (patch: Partial<Omit<QuoteItem, 'id'>>) => void;
  onRemove: () => void;
  onRepick: () => void;
  onTierToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}

function ItemRow({
  item,
  index,
  total,
  hasDiscount,
  autoDiscount,
  isDragging,
  onUpdate,
  onRemove,
  onRepick,
  onTierToggle,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onDropOn,
}: ItemRowProps): JSX.Element {
  const amount = calcItemAmount(item, hasDiscount);
  const [dragOver, setDragOver] = useState(false);
  const isArts = item.priceTier === 'price_arts';
  return (
    <div
      className={`${styles.itemRow} ${isDragging ? styles.itemDragging : ''} ${dragOver ? styles.itemDragOver : ''}`}
      onDragOver={(e) => {
        // preventDefault marks this row as a valid drop target; without it
        // the browser fires no `drop` event. dropEffect drives the cursor.
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onDropOn();
      }}
    >
      <div className={styles.itemTop}>
        <span
          className={styles.itemDrag}
          draggable
          onDragStart={(e) => {
            // HTML5 DnD requires data on the transfer for the drag to be a
            // valid operation (Firefox won't start the drag otherwise, and
            // `drop` won't fire reliably). The actual source index is tracked
            // via React state (onDragStart → setDragIndex); this payload just
            // makes the gesture valid.
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(index));
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          title="拖曳調整順序"
          aria-label="拖曳調整順序"
        >
          ⋮⋮
        </span>
        <label className={`${styles.miniField} ${styles.fieldCat}`}>
          <span>副品項</span>
          <textarea
            rows={2}
            value={item.sub_group}
            // The item-carried service_description is a cache of the catalog row
            // captured at add/repick time. Once the user retypes the category it
            // no longer belongs to that row, so clear it — otherwise syncServices
            // would print the OLD category's 02 摘要/附件 under the new label.
            // Legacy re-derives the description from the catalog by sub_group
            // (legacy.html:2354), which yields empty for a manually-typed
            // category; clearing matches that effect (Codex round-5 P2).
            onChange={(e) => onUpdate({ sub_group: e.target.value, service_description: '' })}
            placeholder="Category"
            aria-label="副品項"
          />
        </label>
        <label className={`${styles.miniField} ${styles.fieldDesc}`}>
          <span>品項名稱</span>
          <textarea
            rows={2}
            value={item.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder="Description"
            aria-label="品項名稱"
          />
        </label>
        <div className={styles.itemActions}>
          <div className={styles.itemReorder}>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={index === 0}
              aria-label="上移品項"
              title="上移"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={index === total - 1}
              aria-label="下移品項"
              title="下移"
            >
              ↓
            </button>
          </div>
          {!item.isManual && (
            <button
              type="button"
              className={styles.itemRepick}
              onClick={onRepick}
              aria-label="重新選擇此品項"
              title="重新選擇此品項"
            >
              ⟲
            </button>
          )}
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
        {!item.isManual && (
          <button
            type="button"
            role="switch"
            aria-checked={isArts}
            className={`${styles.tierSwitch} ${isArts ? styles.tierSwitchArts : ''} ${autoDiscount ? styles.tierSwitchDisabled : ''}`}
            onClick={onTierToggle}
            disabled={autoDiscount}
            aria-label="切換 定價 / 優惠價"
            title={autoDiscount ? '使用折扣模式已鎖定為定價' : '點擊切換 定價/優惠價'}
          >
            <span>定價</span>
            <span>優惠價</span>
          </button>
        )}
        {hasDiscount && (
          <label className={styles.miniField}>
            <span>折扣</span>
            <NumberInput
              value={item.discount ?? 0}
              onCommit={(discount) => onUpdate({ discount: Math.round(Math.max(0, discount)) })}
              aria-label="折扣"
            />
          </label>
        )}
        <span className={styles.itemAmount}>NT$ {formatMoney(amount)}</span>
      </div>
    </div>
  );
}

// ─── CatalogPicker ────────────────────────────────────────────────────────

// Cascading 大品項 → 副品項 → 品項名稱 dropdowns (legacy buildPicker,
// legacy.html line 2763-2830). Picking a name surfaces its 定價/優惠價, then
// 加入 / 替換 commits it.
function CatalogPicker({
  onCancel,
  onPick,
  repick = false,
}: {
  onCancel: () => void;
  onPick: (item: CatalogItem) => void;
  repick?: boolean;
}): JSX.Element {
  const { catalog, loading, error, live } = useItemsCatalog();
  const [group, setGroup] = useState('');
  const [subGroup, setSubGroup] = useState('');
  const [nameIdx, setNameIdx] = useState('');
  const groups = listGroups(catalog);
  const subGroups = group ? listSubGroups(group, catalog) : [];
  const names = group && subGroup ? itemsInSubGroup(group, subGroup, catalog) : [];
  const selected = nameIdx !== '' ? names[Number(nameIdx)] : undefined;
  const label = repick ? '重新選擇品項' : '新增標準品';

  return (
    <div className={styles.picker} role="dialog" aria-label={label}>
      <div className={styles.pickerHead}>
        <span>{label}</span>
        <button type="button" className={styles.pickerCancel} onClick={onCancel} aria-label="取消">
          ✕
        </button>
      </div>
      {repick && <div className={styles.pickerHint}>重新選擇此品項（保留位置與數量）</div>}
      {loading ? (
        <div className={styles.pickerHint}>正在載入品項資料…</div>
      ) : error ? (
        <div className={styles.pickerHint}>線上品項載入失敗（用內建清單）：{error}</div>
      ) : live ? (
        <div className={styles.pickerHint}>已載入 {catalog.length} 筆線上品項</div>
      ) : null}
      <select
        className={styles.pickerSelect}
        aria-label="大品項"
        value={group}
        onChange={(e) => {
          setGroup(e.target.value);
          setSubGroup('');
          setNameIdx('');
        }}
      >
        <option value="">— 大品項 —</option>
        {groups.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <select
        className={styles.pickerSelect}
        aria-label="副品項"
        value={subGroup}
        disabled={group === ''}
        onChange={(e) => {
          setSubGroup(e.target.value);
          setNameIdx('');
        }}
      >
        <option value="">— 副品項 —</option>
        {subGroups.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        className={styles.pickerSelect}
        aria-label="品項名稱"
        value={nameIdx}
        disabled={subGroup === ''}
        onChange={(e) => setNameIdx(e.target.value)}
      >
        <option value="">— 品項名稱 —</option>
        {names.map((n, i) => (
          <option key={i} value={i}>
            {n.name}
          </option>
        ))}
      </select>
      <div className={styles.pickerPrice}>
        {selected
          ? `定價 NT$ ${formatMoney(selected.price_standard)}　·　優惠價 NT$ ${formatMoney(
              selected.price_arts,
            )}　·　${selected.unit}`
          : '請先選擇品項'}
      </div>
      <Button
        variant="primary"
        className={styles.manualSubmit}
        disabled={!selected}
        onClick={() => selected && onPick(selected)}
      >
        {repick ? '替換' : '加入'}
      </Button>
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
