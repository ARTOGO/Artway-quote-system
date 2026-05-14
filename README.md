# ARTWAY 報價單系統

> ARTWAY 業務內部使用的線上報價單生成工具。從 Google Sheet 自動帶入品項與價格、業務勾選後即時生成 A4 報價單、輸出 HTML / PDF。

**🌐 正式網址**：https://artogo.github.io/Artway-quote-system/

---

## 系統流程概覽

```
[Google Sheet] → [Apps Script API] → [GitHub Pages 網頁]
   ↑                                       ↓
   PM 維護品項                            業務填表 → 存 HTML / 印 PDF
```

---

## 給接手 PM 的 Cheat Sheet

### 三個關鍵連結（先 bookmark）

| 用途 | 位置 |
|---|---|
| 品項 / 價格 主表 | [Google Sheet `產品服務表_20260223` 分頁](https://docs.google.com/spreadsheets/d/13gvs_CdBu91rkjPiPHM2CeGmscNRZruve9djli3m7wU/edit) |
| 附件正文 / 服務摘要 | 同 Sheet → `報價單附件內容` 分頁 |
| Apps Script | 同 Sheet → 上方選單「擴充功能」→「Apps Script」 |

### 常見維護任務

#### 改品項價格 / 加新品項
1. 編輯主表 `產品服務表_20260223`
2. 業務在前端按右下「🔄 重新抓取品項資料」拿到新資料
3. **不需要 deploy**

#### 加新副品項的附件正文
1. 在 `報價單附件內容` 分頁加新 row
2. ⚠ **A 欄字串必須跟主表 D 欄完全一致**（包含底線、空格、全形數字、版本號）
3. 業務按 🔄 重新抓取

#### 改 HTML / CSS / JS（系統本身的 code）
1. 改本機 `artway-quote-system.html`（master 在 Google Drive）
2. **雙擊同資料夾下的 `deploy.bat`** → 自動同步到 GitHub Pages
3. 等 1-2 分鐘 → 業務 reload 網頁拿到新版

#### Apps Script 改 code
1. 進編輯器改 → Ctrl+S 存檔
2. 右上「部署」→「**管理部署作業**」→ 找現有的 → 編輯（鉛筆）
3. 「版本」下拉選「**新版本**」→ 部署
4. URL 不變，業務按 🔄 重新抓取

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
├── docs/
│   ├── APPENDIX_SPEC.md        ← 附件改造規格
│   └── HANDOFF_AND_SPEC.md     ← Phase 1-2 handoff（歷史紀錄）
├── 服務說明附件/
│   └── APPENDIX_CONTENT_PROMPT.md  ← 撰寫附件內容用的 session brief
├── reference/                  ← 原始設計範本（PDF / Excel）
└── _archive/                   ← 封存舊版
```

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

---

## 技術架構

- **前端**：純 HTML / CSS / JS，無框架，單一檔案 ~95KB
- **資料源**：Google Sheet（雙分頁架構：master + 附件內容）
- **API**：Apps Script Web App（5 分鐘快取，可手動 force=1）
- **託管**：GitHub Pages（免費、自動 build）
- **狀態保存**：state JSON embed 進 `<script type="application/json">` 寫入 HTML 檔，存出的 HTML 自含完整資料

---

## 版本

當前版本看頁面右下角 `v2026.05.14X` 標記。  
改 code 時記得在 HTML 裡 bump 版本號（讓接手者一眼分辨）。

---

_本系統為 ARTWAY（藝途科技股份有限公司）內部使用，無對外授權。_
