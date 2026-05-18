# ARTWAY 報價單系統

> ARTWAY 業務內部使用的線上報價單生成工具。從 Google Sheet 自動帶入品項與價格、業務勾選後即時生成 A4 報價單、輸出 HTML / PDF、雲端共享歷史紀錄。

**⚠️ 本 repo 正在進行架構重構 v2026.05.15+**：從純前端單檔（GitHub Pages）→ React + Go + Cloud Run + Workspace SSO。詳見 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。

| 環境 | URL | 狀態 |
|---|---|---|
| **prod**（目標） | https://quote.artogo.co | 重構中 |
| **prod**（過渡） | https://artogo.github.io/Artway-quote-system/ | 仍可用，但不再更新 |
| **staging** | （PR 7 後上線） | 尚未上線 |

---

## 系統架構

```
[業務 / PM 瀏覽器]
      ↓ Google Workspace SSO (IAP)
[Cloud Run: quote-app]
   ├── Go binary serves React SPA (embed.FS)
   ├── /api/quotes/* → 報價歷史紀錄 CRUD
   └── /api/items    → 從 Apps Script 取品項目錄
      ↓
[Cloud SQL Postgres]
   └── quotes 表（外層 7 欄索引 + body JSONB）

[Google Sheet]（品項主表）
      ↓ Apps Script Web App
[品項 / 附件 API]
```

完整圖見 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)。
完整後端規格見 [docs/HISTORY_BACKEND_SPEC.md](./docs/HISTORY_BACKEND_SPEC.md)。

---

## 接手者快速上手

### 第一次

1. 裝 [Claude Code](https://claude.ai/code) CLI（在自己的 Mac / Windows）
2. 用有 repo 權限的 GitHub 帳號 `gh auth login`
3. `gh repo clone ARTOGO/Artway-quote-system && cd Artway-quote-system`
4. 讀 [CLAUDE.md](./CLAUDE.md) — 這是與 AI 協作的規則
5. 想試本機跑：照 [docs/LOCAL_DEV.md](./docs/LOCAL_DEV.md)（PR 2 後有完整指令）

### 日常維護

| 想做的事 | 怎麼做 |
|---|---|
| 改品項 / 價格 | 編輯 [Google Sheet `產品服務表_20260223`](https://docs.google.com/spreadsheets/d/13gvs_CdBu91rkjPiPHM2CeGmscNRZruve9djli3m7wU/edit) → 業務按 🔄 重新抓取（**這部分不變**） |
| 改附件正文 | 編輯 Sheet 的 `報價單附件內容` 分頁 → 業務按 🔄 |
| 改前端 UI / 文字 / CSS | 在 Claude Code 跟 AI 說 → push 到 `staging` branch → 看 staging URL → merge `main` |
| 改商業邏輯 / 加功能 | 開 PR；工程師走 review 流程 |
| 部署 | **自動**：push staging → 1-2 分鐘上 staging；merge main → 1-2 分鐘上 prod |
| 壞了 | 看 GitHub Actions、re-run 最近一次成功 deploy；或 revert 最後 PR |

---

## Repo 結構

```
Artway-quote-system/
├── .github/workflows/         CI/CD（PR 7-8 補完）
├── frontend/                  Vite + React + TypeScript + Module SCSS
│   ├── index.html             （目前是舊單檔 152KB，PR 3-4 拆成 React）
│   ├── public/logo/           logo / 公司章圖檔
│   └── src/                   （PR 3 起建）
├── backend/                   Go + chi + pgx + sqlc（PR 2 起建）
├── infra/                     GCP 一次性 setup script（PR 6 起建）
├── docs/
│   ├── HISTORY_BACKEND_SPEC.md  後端規格（v2 黑盒子）
│   ├── ARCHITECTURE.md          系統圖、URL 對照、月費（PR 6 後完整）
│   ├── DEPLOY.md                PM 用 Claude Code 改東西的流程（PR 7 後完整）
│   ├── DESIGN_SYSTEM.md         tokens 對照表 + 元件清單（PR 3-4 後完整）
│   └── LOCAL_DEV.md             docker compose 起本機（PR 2 後完整）
├── CLAUDE.md                  AI 協作守則（必讀）
├── AGENTS.md                  → 指向 CLAUDE.md
└── README.md                  本檔
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

## 認證

新版用 **GCP Identity-Aware Proxy (IAP)** 限制只允許 `@artogo.co` Workspace 員工。第一次開 URL 會自動跳 Google 登入。

工程師本機開發走 `ENV=dev` 模式 bypass IAP（見 `docs/LOCAL_DEV.md`）。

---

## 技術棧

| 層 | 用什麼 |
|---|---|
| 後端 | Go **1.26** + chi/v5 + pgx/v5 + sqlc + goose/v3 |
| 資料庫 | Cloud SQL Postgres **16**（共用既有 `artogo-auth-db` instance）|
| 前端 | Vite **8** + React **19.2** + TypeScript **6.0** + unified `radix-ui` + Module SCSS（Sass）|
| Node | **24-alpine**（Active LTS）|
| 託管 | Cloud Run（前後端合一 service，Go embed Vite dist）|
| 認證 | GCP IAP（Workspace SSO）|
| CI/CD | GitHub Actions + Workload Identity Federation |
| 設計輔助 | [artogo-design-master](https://ougaga26-lab.github.io/artogo-design-master/) Claude Code skill |

---

## 常見問題

### Q. 業務在報價單上看不到服務說明
**A.** 八成是 `報價單附件內容` 分頁的 A 欄（sub_group）跟主表 D 欄字串不一致。
比對：`A-1_實境展間２.０` ≠ `A-1實境展間２.０`（差一個底線）— 必須完全相同。

### Q. 報價單編號不能改？
**A.** 對，鎖死的。報價單編號是**永久 ID**（給後端、給合約引用、給業務之間溝通用），建立後不可變動。如果你想表達「這份是修改版」，請改 ISSUE DATE 那個欄位即可（單號不動）。

---

## 版本

當前版本看頁面右下角 `v2026.05.15X` 標記。
改 code 時記得在前端 bump 版本號（讓接手者一眼分辨）。

---

## 過渡期

- 舊 GitHub Pages 網址 `https://artogo.github.io/Artway-quote-system/` **仍可用**，但不再收到新功能
- 重構完成後會在舊版加橫幅指向新 URL
- 業務原本「另存 HTML」存的舊報價檔仍能本機開啟（self-contained）
- 舊版開發 master 檔在 PM 的 Google Drive（`G:\我的雲端硬碟\[[[AI WORLD]]]\+ARTOGO\ARTOGO報價單生成系統\`）+ `deploy.bat` 雙擊部署，**重構完成後將漸進廢棄此流程**，改為「Claude Code 改檔 → push staging → merge main → 自動部署」

---

_本系統為 ARTWAY（藝途科技股份有限公司）內部使用，無對外授權。_
