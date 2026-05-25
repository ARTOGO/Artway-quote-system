# ARTWAY Self-Serve Development

這份文件給 PM、業務、UIX 與非工程人員使用 AI 開發 ARTWAY 報價系統時閱讀。

目標是讓非工程人員可以自己完成「改需求 -> 上 staging 驗收 -> 上 production」；但仍保留 PR、CI/CD 與 IAP smoke test，避免直接把壞版本推到 production。

## 目前部署規則

| 目標 | Branch | URL | 觸發方式 |
| --- | --- | --- | --- |
| staging | `staging` | `https://quote-staging.artogo.co` | PR merge / push 到 `staging` 後自動跑 `Deploy Staging` |
| production | `main` | `https://quote.artogo.co` | PR merge / push 到 `main` 後自動跑 `Deploy Prod` |

「自助 merge」的意思是：具備 repo `write` 權限的人，在 GitHub checks 綠燈後，可以自己按 PR 的 merge button。它不是直接 push 到 `main` 或 `staging`。

## 權限模型

日常非工程改動已授權給明確 team：

- `ARTOGO-PM`
- `ARTOGO-UIX`
- `ARTOGO-AI`

不要在未確認前把整個 org 或所有 member 都開成 write。目前未開放 `ARTOGO-member` / `ARTOGO-part-time`。取得 repo `write` 權限後，成員可以：

- 建 branch
- push branch
- 開 PR
- merge PR 到 `staging` / `main`，前提是 branch ruleset 和 required checks 都通過

## Self-Serve Flow

### 1. 做改動

1. 從最新 `staging` 或 `main` 開 feature branch。
2. 請 AI 先讀：
   - `CLAUDE.md`
   - `docs/AI_DEVELOPMENT_SKILL.md`
   - `docs/ARCHITECTURE.md`
   - 需要改後端時再讀 `docs/HISTORY_BACKEND_SPEC.md`
   - 需要本機啟動時再讀 `docs/LOCAL_DEV.md`
3. 只改需求相關檔案，不重構無關區塊。
4. 改完後 AI 必須列出驗證證據。

### 2. 上 staging

1. 開 PR 到 `staging`。
2. 等 GitHub `CI` checks 全綠：
   - `Frontend`
   - `Backend`
   - `Docker package`
   - `GitGuardian Security Checks`
3. 如果 AI reviewer 留下 unresolved thread，先修或回覆清楚後 resolve。branch ruleset 要求 review threads 必須全部 resolved。
4. merge 到 `staging`。
5. 等 `Deploy Staging` 成功。
6. 到 `https://quote-staging.artogo.co` 用 `@artogo.co` Google 帳號登入驗收。

### 3. 上 production

1. staging 驗收 OK 後，開 PR `staging -> main`。
2. 等 GitHub required checks 全綠；`main` 和 `staging` 目前要求同一組 checks。
3. merge 到 `main`。
4. 等 `Deploy Prod` 成功。
5. 到 `https://quote.artogo.co` 做最小 smoke：
   - Builder 可以開啟
   - 可以存檔
   - History 看得到剛才存的報價
   - 可以重新載入

## 什麼可以自助 merge

適合自助：

- 文案、欄位 label、提示文字
- 報價單版面與既有 UI 小調整
- 前端顏色、間距、排版，但必須使用 `tokens.scss`
- 已有資料欄位的顯示順序或預設值
- 文件更新

需要工程師或 repo owner review：

- `.github/workflows/`
- `infra/`
- `backend/migrations/`
- Cloud SQL schema / 權限 / Secret / IAP
- quote number 配號、save/load/history、delete 等資料一致性流程
- 新增第三方服務或 npm/go dependency

## AI 必須遵守的 coding convention

- 前端：Vite + React + TypeScript + Radix UI + Module SCSS。
- UI token：只能用 `frontend/src/styles/tokens.scss` 變數；不要寫 magic number、不要用 Tailwind、不要 inline style。
- 互動元件：dropdown、dialog、popover 等用 Radix primitive 或既有封裝。
- source of truth：`frontend/legacy.html` 是 1:1 復刻來源；已復刻畫面不能憑空改設計。
- 報價單號：只能在存檔時由後端配號；不要在新建頁面預先產生 quote number。
- 後端：handler -> service -> repository interface -> Postgres/sqlc；handler 不直接協調交易或配號。
- migration：只加新檔，不改已存在 migration。
- secrets：不可 commit `.env`、service account JSON、password、token。

## 驗證要求

AI 不能只說「看起來可以」。完成前至少要回報：

- 改了哪些檔案
- 跑了哪些測試或檢查
- 結果是 pass / fail
- staging 或 production 的 workflow run URL
- 若有 browser flow，列出實際驗證路徑與結果
- 沒驗到的項目要明列 `Not covered`

## Rollback

production 出問題時：

1. 先不要再繼續 merge。
2. 找最後一個成功的 `Deploy Prod` workflow。
3. 小問題：開 hotfix PR 到 `main`。
4. 大問題：revert 最後一個 merge commit，再讓 `Deploy Prod` 自動部署回上一版。
5. DB migration 已跑過時，不要手動改舊 migration；找工程師設計 forward-fix migration。
