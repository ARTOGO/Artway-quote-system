# ARTWAY 報價單系統

> ARTWAY 業務內部使用的線上報價單生成工具。從 Google Sheet 自動帶入品項與價格、業務勾選後即時生成 A4 報價單、輸出 HTML / PDF、儲存到雲端共享歷史紀錄。

**🌐 正式網址**：https://artogo.github.io/Artway-quote-system/

---

## 👷 給後端工程師

完整 API 規格請看 → **[`docs/HISTORY_BACKEND_SPEC.md`](docs/HISTORY_BACKEND_SPEC.md)**

### 30 秒摘要

- 需要做：6 個 REST API（流水號、CRUD、軟刪除）
- **黑盒子模式**：你只解析外層 7 個欄位（quote_no / status / title / total_amount / client_company / sales_name / issue_date），其餘 JSON 整包原樣存取
- DB 建議：`quotes` 表 = 上述 7 欄 + `body JSONB` 一欄
- CORS 必須允許 `https://artogo.github.io`
- QPS 極低（< 5/sec），SLA 一般可用即可
- 無認證（內部信任）

### 完成後請回覆

1. API base URL（例：`https://api.xxx.com/quotes`）
2. CORS 已允許 `https://artogo.github.io` 確認
3. 兩個 curl 測試通過：
   - `curl -X POST <base>/next-number` → 拿到流水號
   - `curl -X GET <base>` → 拿到（空的）列表

前端已經用 mock 接好所有 endpoint，URL 給我後直接替換 `MOCK` → `fetch`，半小時內上線。

之後前端不管怎麼改 Quote 內部結構（折讓、分期、新區塊…），**後端都不用動**。

---

## 系統流程概覽

```
[Google Sheet] ──→ [Apps Script API] ──→ [GitHub Pages 網頁] ←──→ [後端 API]
   ↑                                              ↓                    ↓
   PM 維護品項                            業務填表 → 雲端歷史      DB / Storage
```

---

## 👨‍💼 給接手 PM 的 Cheat Sheet

### 三個關鍵連結（先 bookmark）

| 用途 | 位置 |
|---|---|
| 品項 / 價格 主表 | [Google Sheet `產品服務表_20260223` 分頁](https://docs.google.com/spreadsheets/d/13gvs_CdBu91rkjPiPHM2CeGmscNRZruve9djli3m7wU/edit) |
| 附件正文 / 服務摘要 | 同 Sheet → `報價單附件內容` 分頁 |
| Apps Script | 同 Sheet → 上方選單「擴充功能」→「Apps Script」 |

### 常見維護任務

#### 改品項價格 / 加新品項
1. 編輯主表 `產品服務表_20260223`
2. 業務在前端按「重新抓取品項資料」拿到新資料
3. **不需要 deploy**

#### 加新副品項的附件正文
1. 在 `報價單附件內容` 分頁加新 row
2. ⚠ **A 欄字串必須跟主表 D 欄完全一致**（包含底線、空格、全形數字、版本號）
3. 業務按「重新抓取」

#### 改 HTML / CSS / JS（系統本身的 code）
1. 改本機 `artway-quote-system.html`（master 在 Google Drive）
2. **雙擊同資料夾下的 `deploy.bat`** → 自動同步到 GitHub Pages
3. 等 1-2 分鐘 → 業務 reload 網頁拿到新版

#### Apps Script 改 code
1. 進編輯器改 → Ctrl+S 存檔
2. 右上「部署」→「**管理部署作業**」→ 找現有的 → 編輯（鉛筆）
3. 「版本」下拉選「**新版本**」→ 部署
4. URL 不變，業務按「重新抓取」

---

## 環境設定（第一次接手要做）

- [GitHub Desktop](https://desktop.github.com/) — 登入有此 repo 推送權限的帳號
- [Git for Windows](https://git-scm.com/download/win) — `deploy.bat` 自動 push 需要（沒裝會自動 fallback 到 GitHub Desktop 手動模式）
- 主檔本機路徑：`G:\我的雲端硬碟\[[[AI WORLD]]]\+ARTOGO\ARTOGO報價單生成系統\`

---

## 檔案結構（master 開發資料夾）

```
ARTOGO報價單生成系統/
├── artway-quote-system.html   ← 主檔（修改這個）
├── deploy.bat                  ← 雙擊部署到 GitHub Pages
├── logo/                       ← logo + 公司章圖檔
├── artway-deploy/
│   └── Artway-quote-system/    ← Git repo 本機 clone（deploy.bat 自動寫入）
│       └── docs/
│           └── HISTORY_BACKEND_SPEC.md  ← 後端 API 規格
├── docs/
│   ├── APPENDIX_SPEC.md        ← 附件改造規格
│   ├── HANDOFF_AND_SPEC.md     ← Phase 1-2 handoff
│   └── HISTORY_BACKEND_SPEC.md ← 後端 API 規格（master 版本）
├── 服務說明附件/
│   └── APPENDIX_CONTENT_PROMPT.md  ← 撰寫附件內容用的 session brief
├── reference/                  ← 原始設計範本（PDF / Excel）
└── _archive/                   ← 封存舊版
```

---

## 主要功能

- **報價單編輯器**（Builder + A4 預覽，左右雙欄）
- **標準品 / 手動品項** — 標準品從 Google Sheet 帶入，手動品項可自訂價格
- **折扣欄位** — 可顯示定價/優惠價對照
- **最後金額異動** — 議價、手續費等不屬於品項的金額調整（可正可負）
- **服務說明摘要** — 自動帶入附件正文【標題】，可手動覆寫
- **附件** — 每個副品項一頁，包含執行內容、注意事項
- **雲端歷史紀錄** — 所有業務共享，可搜尋、篩選、載入舊報價繼續編輯
- **狀態追蹤** — 草稿 / 已送出 / 已簽回 / 已執行
- **載入舊報價時**會詢問是否更新開立日期（單號不變）
- **HTML 自含資料** — Shift+點儲存可下載含資料的 HTML 給特殊需求

---

## 常見問題

### Q. 業務在報價單上看不到服務說明
**A.** 八成是 `報價單附件內容` 分頁的 A 欄（sub_group）跟主表 D 欄字串不一致。
比對：`A-1_實境展間２.０` ≠ `A-1實境展間２.０`（差一個底線）— 必須完全相同。

### Q. 修改了 master 但網站沒更新
**A.** 雙擊 `deploy.bat` 才會推到 GitHub。或業務瀏覽器有快取 → 請按 Ctrl+Shift+R 強制重整。

### Q. 列印第二頁內容貼在紙頂沒留白
**A.** 列印對話框「邊界」要選**預設**（不是「無」）。第一頁會邊到邊（金棕帶貼紙頂），第二頁起會有 12mm 留白。

### Q. 業務存的 HTML 開起來資料是空的
**A.** 確認用最新 master 存的（看右下角版本號）。舊版本存的 HTML embed 的 JS 可能有 bug，需要重新存。

### Q. Apps Script 改完沒效果
**A.** 別忘了「重新部署」— Ctrl+S 只是存程式碼，不會更新已部署的 Web App URL。要去「管理部署作業」選「新版本」。

### Q. 報價單編號不能改？
**A.** 對，鎖死的。報價單編號是**永久 ID**（給後端、給合約引用、給業務之間溝通用），建立後不可變動。如果你想表達「這份是修改版」，請改 ISSUE DATE 那個欄位即可（單號不動）。

---

## 技術架構

- **前端**：純 HTML / CSS / JS，無框架，單一檔案 ~120KB
- **資料源**：Google Sheet（雙分頁架構：master + 附件內容）
- **品項 API**：Apps Script Web App（5 分鐘快取，可手動 force=1）
- **報價儲存 API**：獨立後端（規格見 `docs/HISTORY_BACKEND_SPEC.md`）
- **託管**：GitHub Pages（免費、自動 build）
- **路由**：Hash routing（`#/`、`#/history`、`#/quote/AW-260515-007`）

---

## 版本

當前版本看頁面右下角 `v2026.05.XX` 標記。
改 code 時記得在 HTML 裡 bump 版本號（讓接手者一眼分辨）。

---

_本系統為 ARTWAY（藝途科技股份有限公司）內部使用，無對外授權。_
