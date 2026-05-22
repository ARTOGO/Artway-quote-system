// Items catalog — Session 2 stub, Session 4b expanded to the legacy
// hierarchy (大品項 group → 副品項 sub_group → 品項名稱 name).
//
// Legacy fetches this from a Google Apps Script endpoint (`API_URL` in
// legacy.html line 2083) — hundreds of real items. This fixture mirrors the
// real CATEGORY STRUCTURE the business uses (e.g. A展間系統 with A-1~A-7) so
// the cascading picker behaves like legacy out of the box. Wiring the live
// API (the full real item list) is the PR5 backend task.
//
// sub_group carries the "<code>_<名稱>" convention (e.g. "A-1_實境展間 2.0");
// displaySubGroup() strips the "A-1_" prefix for the customer-facing preview.

export interface CatalogItem {
  group: string; // 大品項 primary category (e.g. "A展間系統") — picker level 1
  sub_group: string; // 副品項 (e.g. "A-1_實境展間 2.0") — picker level 2 + Preview Category
  name: string; // 品項名稱 specific item — picker level 3
  unit: string; // e.g. "式" / "件" / "場" / "年"
  price_standard: number; // 定價 list price (NTD integer)
  price_arts: number; // 優惠價 ARTOGO arts price
  // Service description (sheet "D 欄"). Parsed by parseAppendixSections into
  // 【title】 + bullet sections → drives 02 服務說明摘要 + appendix pages.
  // Empty string = no appendix for this item.
  service_description: string;
}

// Per-item service descriptions (legacy sheet "D 欄"). Format: 【區塊標題】
// lines start a section, other lines become bullets. Empty = no appendix.
const SVC_AR = `【拍攝規格】
720° 環物或 4K 平面，依方案而定
含打光、去背、色彩校正
【交付物】
網頁嵌入用 embed 連結
原始檔（依授權範圍）
【作業時程】
場勘後 5 個工作日內交付初稿`;

const SVC_VR = `【建置範圍】
虛擬展間場景建模與導覽動線
熱點與資訊卡設定
【交付物】
線上瀏覽連結（RWD）`;

const SVC_WEB = `【網站建置】
RWD 響應式設計，支援手機 / 平板 / 桌機
SEO 基礎設定與網站地圖
【測試上線】
跨瀏覽器相容性測試`;

const SVC_DESIGN = `【主視覺設計】
品牌主視覺一套（含 2 次修改）
色彩與字體規範`;

const SVC_VIDEO = `【影音製作】
活動紀錄剪輯成片
配樂與字幕`;

const SVC_PM = `【專案管理】
每月進度追蹤與例會
跨團隊溝通協調與風險控管`;

// Representative catalog mirroring the legacy hierarchy. The A展間系統 group
// reproduces the real A-1~A-7 sub_groups the business uses (from the live
// sheet); other groups are representative until the real API is wired (PR5).
export const ITEMS_CATALOG_FIXTURE: ReadonlyArray<CatalogItem> = [
  // ─── A展間系統 (A-1 ~ A-7) ──────────────────────────────────────────────
  {
    group: 'A展間系統',
    sub_group: 'A-1_實境展間 2.0',
    name: '標準型（720° 環物）',
    unit: '件',
    price_standard: 12000,
    price_arts: 9600,
    service_description: SVC_AR,
  },
  {
    group: 'A展間系統',
    sub_group: 'A-1_實境展間 2.0',
    name: '進階型（4K）',
    unit: '件',
    price_standard: 18000,
    price_arts: 14400,
    service_description: SVC_AR,
  },
  {
    group: 'A展間系統',
    sub_group: 'A-2_實境展間 4.0',
    name: '標準建置',
    unit: '場',
    price_standard: 25000,
    price_arts: 20000,
    service_description: SVC_AR,
  },
  {
    group: 'A展間系統',
    sub_group: 'A-3_維護管理',
    name: '年度維護約',
    unit: '年',
    price_standard: 30000,
    price_arts: 24000,
    service_description: '',
  },
  {
    group: 'A展間系統',
    sub_group: 'A-4_虛擬展間 (ARTOGO版)',
    name: '標準建置',
    unit: '式',
    price_standard: 60000,
    price_arts: 48000,
    service_description: SVC_VR,
  },
  {
    group: 'A展間系統',
    sub_group: 'A-5_虛擬展間 (其他)',
    name: '客製建置',
    unit: '式',
    price_standard: 80000,
    price_arts: 64000,
    service_description: SVC_VR,
  },
  {
    group: 'A展間系統',
    sub_group: 'A-6_上線後修改',
    name: '內容更新（每次）',
    unit: '次',
    price_standard: 5000,
    price_arts: 4000,
    service_description: '',
  },
  {
    group: 'A展間系統',
    sub_group: 'A-7_展間其他製作',
    name: '其他製作（估）',
    unit: '式',
    price_standard: 10000,
    price_arts: 8000,
    service_description: '',
  },
  // ─── B網站系統 ──────────────────────────────────────────────────────────
  {
    group: 'B網站系統',
    sub_group: 'B-1_形象網站',
    name: '單頁版 (One-page)',
    unit: '式',
    price_standard: 35000,
    price_arts: 28000,
    service_description: SVC_WEB,
  },
  {
    group: 'B網站系統',
    sub_group: 'B-1_形象網站',
    name: '多頁版 (5 pages)',
    unit: '式',
    price_standard: 80000,
    price_arts: 64000,
    service_description: SVC_WEB,
  },
  {
    group: 'B網站系統',
    sub_group: 'B-2_主機代管',
    name: '雲端主機（年費）',
    unit: '年',
    price_standard: 12000,
    price_arts: 9600,
    service_description: '',
  },
  // ─── C設計系統 ──────────────────────────────────────────────────────────
  {
    group: 'C設計系統',
    sub_group: 'C-1_平面設計',
    name: '主視覺一套',
    unit: '式',
    price_standard: 30000,
    price_arts: 24000,
    service_description: SVC_DESIGN,
  },
  {
    group: 'C設計系統',
    sub_group: 'C-1_平面設計',
    name: '衍生物（DM / 海報）',
    unit: '件',
    price_standard: 8000,
    price_arts: 6400,
    service_description: SVC_DESIGN,
  },
  {
    group: 'C設計系統',
    sub_group: 'C-2_影音製作',
    name: '活動紀錄 3 分鐘',
    unit: '件',
    price_standard: 22000,
    price_arts: 17600,
    service_description: SVC_VIDEO,
  },
  // ─── D專案系統 ──────────────────────────────────────────────────────────
  {
    group: 'D專案系統',
    sub_group: 'D-1_專案管理',
    name: '統籌（每月）',
    unit: '月',
    price_standard: 50000,
    price_arts: 40000,
    service_description: SVC_PM,
  },
];

/** All distinct 大品項 group categories, in first-seen (catalog) order. */
export function listGroups(catalog: ReadonlyArray<CatalogItem> = ITEMS_CATALOG_FIXTURE): string[] {
  return Array.from(new Set(catalog.map((it) => it.group))).filter(Boolean);
}

/** Distinct 副品項 sub_groups within a 大品項 group, in catalog order. */
export function listSubGroups(
  group: string,
  catalog: ReadonlyArray<CatalogItem> = ITEMS_CATALOG_FIXTURE,
): string[] {
  return Array.from(
    new Set(catalog.filter((it) => it.group === group).map((it) => it.sub_group)),
  ).filter(Boolean);
}

/** Items (品項名稱 level) within a group + sub_group, in catalog order. */
export function itemsInSubGroup(
  group: string,
  subGroup: string,
  catalog: ReadonlyArray<CatalogItem> = ITEMS_CATALOG_FIXTURE,
): CatalogItem[] {
  return catalog.filter((it) => it.group === group && it.sub_group === subGroup);
}

/** Items belonging to a primary group. */
export function filterByGroup(
  group: string,
  catalog: ReadonlyArray<CatalogItem> = ITEMS_CATALOG_FIXTURE,
): CatalogItem[] {
  return catalog.filter((it) => it.group === group);
}

/**
 * Fuzzy substring match across name + sub_group + unit. Case-insensitive,
 * empty query returns everything. (Kept for any search-based callers/tests.)
 */
export function searchItems(
  query: string,
  catalog: ReadonlyArray<CatalogItem> = ITEMS_CATALOG_FIXTURE,
): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...catalog];
  return catalog.filter(
    (it) =>
      it.name.toLowerCase().includes(q) ||
      it.sub_group.toLowerCase().includes(q) ||
      it.unit.toLowerCase().includes(q),
  );
}
