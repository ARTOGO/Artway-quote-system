// Items catalog — Session 2 stub.
//
// Legacy fetches from a Google Apps Script endpoint (`API_URL` in legacy.html
// line 2073). For Session 2 we ship a hardcoded fixture of representative
// items so business can test the picker UX. PR 5 (frontend → backend API)
// will swap this for `GET /api/items` (TODO: add endpoint to
// HISTORY_BACKEND_SPEC v3).

export interface CatalogItem {
  group: string; // primary category (A / B / C / D — used in picker hierarchy)
  sub_group: string; // sub-category id (e.g. A-1) — shown in Preview Category col
  name: string; // description (e.g. "AR 立體攝影 - 標準型")
  unit: string; // e.g. "式" / "件" / "場" / "年"
  price_standard: number; // standard / list price (NTD integer)
  price_arts: number; // ARTOGO arts-discount price (Session 2.5 will surface)
}

// 10 sample items spanning 3 group categories — enough variety for picker
// search / category filter testing. Real prices replaced by representative
// round numbers; production data comes via API in PR 5.
export const ITEMS_CATALOG_FIXTURE: ReadonlyArray<CatalogItem> = [
  {
    group: 'A',
    sub_group: 'A-1',
    name: 'AR 立體攝影｜標準型（720°）',
    unit: '件',
    price_standard: 12000,
    price_arts: 9600,
  },
  {
    group: 'A',
    sub_group: 'A-1',
    name: 'AR 立體攝影｜進階型（4K）',
    unit: '件',
    price_standard: 18000,
    price_arts: 14400,
  },
  {
    group: 'A',
    sub_group: 'A-2',
    name: '展覽虛擬導覽｜半天場勘 + 後製',
    unit: '場',
    price_standard: 25000,
    price_arts: 20000,
  },
  {
    group: 'B',
    sub_group: 'B-1',
    name: '網站建置｜單頁版 (One-page)',
    unit: '式',
    price_standard: 35000,
    price_arts: 28000,
  },
  {
    group: 'B',
    sub_group: 'B-1',
    name: '網站建置｜多頁版 (5 pages)',
    unit: '式',
    price_standard: 80000,
    price_arts: 64000,
  },
  {
    group: 'B',
    sub_group: 'B-2',
    name: '主機代管｜雲端（年費）',
    unit: '年',
    price_standard: 12000,
    price_arts: 9600,
  },
  {
    group: 'C',
    sub_group: 'C-1',
    name: '平面設計｜主視覺一套',
    unit: '式',
    price_standard: 30000,
    price_arts: 24000,
  },
  {
    group: 'C',
    sub_group: 'C-1',
    name: '平面設計｜衍生物（DM / 海報）',
    unit: '件',
    price_standard: 8000,
    price_arts: 6400,
  },
  {
    group: 'C',
    sub_group: 'C-2',
    name: '影音剪輯｜活動紀錄 3 分鐘',
    unit: '件',
    price_standard: 22000,
    price_arts: 17600,
  },
  {
    group: 'D',
    sub_group: 'D-1',
    name: '專案管理 / 統籌（每月）',
    unit: '月',
    price_standard: 50000,
    price_arts: 40000,
  },
];

/** All distinct primary group categories present in the fixture. */
export function listGroups(catalog: ReadonlyArray<CatalogItem> = ITEMS_CATALOG_FIXTURE): string[] {
  return Array.from(new Set(catalog.map((it) => it.group))).sort();
}

/** Items belonging to a primary group. */
export function filterByGroup(
  group: string,
  catalog: ReadonlyArray<CatalogItem> = ITEMS_CATALOG_FIXTURE,
): CatalogItem[] {
  return catalog.filter((it) => it.group === group);
}

/**
 * Fuzzy substring match across name + sub_group. Case-insensitive,
 * empty query returns everything.
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
