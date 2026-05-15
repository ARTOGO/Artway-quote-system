# CLAUDE.md — ARTWAY 報價單系統

> 給每個 Claude Code 使用者（PM / 業務 / 工程師）讀的協作守則。打開 repo 第一件事：讀完這份。

---

## 你正在做什麼

這是 **ARTWAY**（藝途科技股份有限公司）業務內部的線上報價系統。原本是純前端單檔 HTML 掛 GitHub Pages，正在重構成：

- **後端**：Go on Cloud Run + Cloud SQL Postgres（依 `docs/HISTORY_BACKEND_SPEC.md` 實作）
- **前端**：Vite + React + TypeScript + Radix UI + Module SCSS（從原 `index.html` 1:1 復刻）
- **託管**：Cloud Run 合一 service（Go binary embed Vite dist）
- **認證**：GCP IAP，限制 `@artogo.co` Workspace 員工
- **CI/CD**：GitHub Actions + Workload Identity Federation
- **環境**：`main` → prod、`staging` → staging

完整架構說明見 `docs/ARCHITECTURE.md`，後端規格見 `docs/HISTORY_BACKEND_SPEC.md`。

---

## 部署環境

| 環境 | URL | branch | 觸發 |
|---|---|---|---|
| **prod** | `https://quote.artogo.co`（最終 domain；過渡期：`https://quote-app-prod-xxx.run.app`） | `main` | push / merge → 自動部署 |
| **staging** | `https://quote-staging-app-xxx.run.app` | `staging` | push → 自動部署 |
| **dev** | `http://localhost:8080` | local | `docker compose up` |

> 三個環境都會擋 IAP，第一次開瀏覽器要 Google 登入（@artogo.co 帳號）。

---

## 工作流

### PM / 業務（改文字、改 UI、改報價單版面）

1. 開 Claude Code 進到這個 repo（如果還沒：`gh repo clone ARTOGO/Artway-quote-system`）
2. 跟 Claude 說你要做什麼（例如：「把『付款條件』改成『付款方式』」）
3. Claude 改完會建議 push 到 `staging` branch
4. 等 1-2 分鐘 GitHub Actions 跑完，去 staging URL 看效果
5. OK 後請 Claude 開 PR `staging → main`
6. 工程師 review → merge → 自動上 prod

### 工程師（改後端、改架構、加新 endpoint）

1. 開新 branch：`git checkout -b feature/xxx`
2. 改 `backend/` 或 `frontend/`
3. 跑本機驗證：`docker compose up`（後端 + 前端 + Postgres 一鍵起）
4. 寫測試（TDD：先測試後實作）
5. push branch → 開 PR
6. CI 過 → reviewer 批 → merge → 進 staging（先 cherry-pick / merge 到 staging branch）→ 驗 OK → merge main

---

## 禁止項

- ❌ **直接 push `main`** — 有分支保護擋
- ❌ **改 `backend/migrations/` 已存在的檔案** — 要加新 migration 檔（`0002_xxx.sql`），不要改舊的
- ❌ **commit `.env` / service account JSON / 任何 secret** — 用 GitHub Secrets + GCP Secret Manager
- ❌ **改 `.github/workflows/` 沒先讓工程師 review** — CI/CD 邏輯關係到部署安全
- ❌ **用 inline style / magic number 寫 UI** — 一律從 `frontend/src/styles/tokens.scss` 取值
- ❌ **用 Tailwind / 其他 CSS framework** — 此專案統一用 Module SCSS

---

## 改前端常見任務

### 改文字 / 換顏色 / 調間距
1. 找到對應的 `.module.scss` 檔（co-located 與 `.tsx`）
2. 改值；**所有顏色 / 字級 / 間距 / 圓角 / 陰影必須用 `tokens.scss` 變數**，不可寫 magic number
3. 跑 `cd frontend && npm run dev` 開 localhost:5173 看效果
4. 列印相關改動：Cmd+P 看 PDF 預覽

### 改商業邏輯（金額計算、折讓、稅率）
1. 邏輯都在 `frontend/src/lib/quoteCalc.ts`（pure functions）
2. 改之前先寫測試：`frontend/src/lib/quoteCalc.test.ts`
3. 跑 `npm test` 確認綠
4. 改完跑 `npm run typecheck` 確認 type 沒爛

### 加新元件
1. 先看 `frontend/src/components/` 有沒有可重用的（Button / Dialog / Dropdown / Toast 等）
2. 互動元件（dropdown / modal / popover）一律用 `@radix-ui/react-*` 的 primitive 包，**不可直接寫原生 HTML**（a11y / focus management 才會對）
3. 樣式寫在 co-located 的 `XxxName.module.scss`
4. 加進 `docs/DESIGN_SYSTEM.md` 元件清單

### 設計新視覺
1. 先用觸發詞「**ARTOGO 設計**」叫 design master skill 想方案（不是必要，但複雜畫面建議）
2. 落地時對齊 `tokens.scss` 的色票、字級、陰影
3. 列印模式特別注意：A4 尺寸、邊到邊金色帶、頁碼分頁

---

## 改後端常見任務

### 新增 endpoint
1. 對 `docs/HISTORY_BACKEND_SPEC.md` 補規格（先文件後 code）
2. 在 `backend/internal/quotes/queries.sql` 加 SQL
3. 跑 `sqlc generate` 生 Go 型別
4. 加 handler / service / 測試
5. 跑 `go test ./...`

### 改 DB schema
1. **絕對不改舊 migration**；加 `backend/migrations/000N_xxx.sql`
2. 本機跑 `docker compose up` 確認 migration 順
3. staging 部署後，CI 會自動跑 goose up

### 接 IAP user
- 已封裝在 `backend/internal/auth/iap.go`，handler 內用 `auth.UserFromCtx(ctx)` 拿 email
- 本機 dev：`ENV=dev DEV_USER_EMAIL=peter@artogo.co` 模擬

---

## 必跑檢查

**改前端後**：
```
cd frontend
npm run typecheck    # 必過
npm run lint         # 必過
npm test             # 必過
npm run dev          # 本機 visual check
```

**改後端後**：
```
cd backend
go vet ./...
go test ./...
golangci-lint run
docker compose up    # 整套本機跑通
```

**Commit 前**（依全域 CLAUDE.md 規則）：
跑 `/codex:review` 拿到 findings → 整理成表格 → 等使用者拍板 → 修完才 commit。

---

## Design System

### Source of truth
- 視覺 token：`frontend/src/styles/tokens.scss`
- 元件清單：`docs/DESIGN_SYSTEM.md`
- 互動 primitives：`@radix-ui/react-*`（包成 `frontend/src/components/`）

### 美學方向
- 主色：金棕 `$color-gold` (`#BA9972`)
- 字型：Roboto + Noto Sans TC
- 風格：印刷品質、A4 版面、邊到邊金色帶頂部裝飾
- 陰影：5 層 elevation（對齊 ADS v3.0）

### AI 設計助手
專案有裝 `artogo-design-master` Claude Code skill。設計新畫面時可用觸發詞：
- 「ARTOGO 設計」
- 「ARTOGO Design Master」

**注意**：這是 Claude Code 的 AI skill，**不是 npm package、不是 React 元件庫**。它幫你想方案；落地時還是要自己用 Radix + Module SCSS 寫 React 元件。

---

## 安裝 design master skill（一次性）

如果還沒裝：
```bash
npx skills add ougaga26-lab/artogo-design-master -g --agent claude-code -y
# 重啟 Claude Code
```

詳細：https://ougaga26-lab.github.io/artogo-design-master/#install

---

## 報告語言

預設**繁體中文**。code 內的英文（變數、函式名、commit message 一般用英文）照常。

---

## 緊急聯絡

- 系統壞了：開 GitHub Actions 找最近成功的 prod deploy → re-run；不行就 revert main 上最後一次 PR
- IAP 進不去：確認 `@artogo.co` Google 帳號登入；不行找工程師檢查 IAP policy
- DB 異常：Cloud Logging → 看 Cloud SQL slow query / error

---

_本文件是 source of truth。改流程 / 改架構時要同步更新這份。_
