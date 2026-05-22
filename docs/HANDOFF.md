# ARTWAY 報價單系統 — 交接文件 (HANDOFF)

> 最後更新：2026-05-22 ｜ 分支：`feature/session-3-preview` ｜ PR：[#7](https://github.com/ARTOGO/Artway-quote-system/pull/7)（OPEN，→ `main`）
>
> 這份文件給「下一位接手的人」：看完就懂專案全貌、現在卡在哪、接下來照什麼順序做。先讀本檔，再依需要往下鑽 `CLAUDE.md` / `docs/`。

---

## 0. TL;DR（30 秒版）

- **在做什麼**：把 ARTWAY 業務的舊版「單檔 HTML 報價系統」（GitHub Pages、4228 行）重構成 **React + TS 前端 + Go + Postgres 後端 + Cloud Run + GCP IAP 登入**。
- **現在在哪**：前端 1:1 復刻 + 前後端 API 串接（PR5）**功能已完成**。最新兩件修正已驗證並 push 到 PR #7：①報價單號改「**存檔才配號**」、②**歷史紀錄頁 1:1 深色復刻**。
- **馬上要做的三件事**：
  1. PR #7 head 已更新到 `80c2a5d`，包含 Option B、History 深色復刻、handoff 與 QA status。
  2. GitHub 分支保護目前擋 merge：`gh pr merge 7 --merge` 回 `base branch policy prohibits the merge`；auto-merge 也未啟用。
  3. 開始 **部署 infra（PR6–8）**：GCP WIF / Cloud SQL / Artifact Registry / Secret Manager / IAP + CI/CD。**這是目前最大的未完成區塊。**
- **PR #7 已 push、尚未 merge**。下一步需要 GitHub reviewer / admin 依 repo policy 完成合併到 `main`。

---

## 1. 專案目標與成功條件

**最終目標**：業務在 `quote.artogo.co` 用 Google（@artogo.co）登入即可建立 / 查詢 / 列印報價單，全公司共享歷史紀錄；舊 GitHub Pages 退場。

**成功條件（success criteria）**：
1. 業務透過 Workspace SSO 登入並完成「新報價 → 儲存 → 查詢 → 列印」完整流程。
2. 報價單號由後端**原子性配發**，同日兩位業務開新報價不撞號。
3. 歷史報價全公司共享、可按業務 / 狀態 / 日期 / 客戶篩選。
4. 列印 PDF 視覺與舊版 **1:1 一致**（A4、金色頂條、版面、字級、表格）。
5. 舊 GitHub Pages 可安全退場、業務舊書籤不 404。
6. CI/CD 雙環境（staging / prod）自動部署、`main` 受分支保護。

**技術棧**：
| 層 | 選用 |
|---|---|
| 前端 | Vite 8 + React 19 + TypeScript + **CSS Modules (SCSS)** + Radix（互動 primitive）|
| 後端 | Go + chi/v5 + pgx/v5 + **sqlc** + goose/v3 |
| DB | Cloud SQL Postgres 16（本機用 docker compose 起 postgres:16）|
| 託管 | Cloud Run 合一 service（Go binary `embed` 前端 dist）|
| 認證 | GCP IAP（限 `@artogo.co`）；本機用 `DEV_USER_EMAIL` bypass |
| CI/CD | GitHub Actions + Workload Identity Federation（**尚未建**）|

> 完整原始規劃見 plan 檔：`~/.claude/plans/history-backend-spec-md-rosy-willow.md`（v2）。後端黑盒規格：`docs/HISTORY_BACKEND_SPEC.md`。

---

## 2. Roadmap 與目前位置

```
PR1 Foundation（repo 重組 / 搬 legacy / 文件）      ✅ 完成
PR2 Backend MVP（Go 7 endpoints + migrations + sqlc）✅ 完成（本機）
PR3 前端骨架（Vite + Radix + tokens.scss）          ✅ 完成
PR4 前端完整復刻（Builder + 預覽 + 列印 + modal）    ✅ 完成
PR5 前端 ↔ 後端 API 串接                            🔵 ← 你在這
        ├─ 雲端儲存 / PDF 輸出                        ✅
        ├─ History 頁 + #/quote 深連結載入            ✅
        ├─ 報價單號「存檔才配號」（Option B）          ✅ 本輪
        └─ History 頁 1:1 深色復刻                     ✅ 本輪
PR6 GCP infra 一次性 setup（WIF/SQL/AR/SM/IAP）      ⬜ 未開始 ← 下一個大區塊
PR7 CI/CD staging（ci.yml + deploy-staging.yml）     ⬜
PR8 CI/CD prod + main 分支保護                       ⬜
PR9 業務 cutover（換網址 + IAP 引導 + 舊站退場）       ⬜
```

**關鍵事實**：`infra/` 只有空的 `README.md`、`.github/workflows/` 是空的 → **整個部署鏈（PR6–8）還沒做**。前端 + 後端在本機都跑得起來且功能完整，但還沒上雲、還沒有 staging/prod 網址、IAP 還沒接。

---

## 3. 怎麼在本機跑起來

詳見 `docs/LOCAL_DEV.md`。最短路徑：

```bash
# 1) 後端 + Postgres + 自動 migration（背景）
cd backend
docker compose up -d            # 起 quote-app-postgres(:5432) + migrate + quote-app-server(:8080)
curl localhost:8080/readyz      # 期望 200

# 2) 前端 dev server（proxy /api → :8080）
cd ../frontend
npm install                     # 第一次
npm run dev                     # http://localhost:5173
```

- 本機認證：後端 `ENV=dev DEV_USER_EMAIL=dev@artogo.co`（compose 已設），不需登入。
- 改後端程式後要 **重 build container**：`docker compose up -d --build server`。
- **改前端 hooks 後**（QuoteContext / useSaveQuote 等）：dev server HMR 可能殘留 ghost 錯誤（`useRef is not defined` / hooks order）→ **重啟 dev server 或 hard reload（⌘⇧R）**。production build 永遠是乾淨的。

**Dev DB 注意**：目前有 8 筆測試報價（含我 QA 時建的 `OPTION-B-PROBE` 等）。要清空重來：`cd backend && docker compose down -v && docker compose up -d`（會砍 volume 重跑 migration）。

---

## 4. 程式架構導覽（關鍵檔案地圖）

```
backend/
  cmd/server/main.go              # entrypoint
  internal/quotes/
    handler.go                    # HTTP handlers（Create 在此「存檔配號」— 見 §5.1）
    repo.go / queries.sql         # sqlc：改 SQL 後跑 `sqlc generate`
    sqlcgen/                       # 產生碼（package quotesdb）— 勿手改
    routes.go                     # by-number/{quote_no} 要排在 /{id} 之前
  migrations/000N_*.sql           # 只「加新檔」，絕不改舊 migration
  internal/auth/iap.go            # 讀 IAP header；dev 讀 DEV_USER_EMAIL
  internal/static/embed.go        # //go:embed dist（prod 包前端）

frontend/src/
  legacy.html                     # ★ 1:1 復刻的 source of truth（4228 行舊版）
  state/
    quoteTypes.ts                 # Quote 型別 + STATUS_OPTIONS（draft/sent/signed/executed）
    quoteReducer.ts               # 純 reducer（含 SET_SAVED 邏輯）
    QuoteContext.tsx              # Provider（在 router 之上）+ instance-epoch（見 §5.1）
  lib/
    useSaveQuote.ts               # 雲端存檔；stamp vs status 兩種 guard（見 §5.1）
    quoteCalc.ts                  # 金額計算（pure functions，測試覆蓋重）
    useHashRoute.ts               # hash 路由 + navigate(to,{replace})
    print.ts                      # window.print 包裝
  api/quotes.ts                   # CRUD（createQuote/updateQuote/listQuotes/...）
  pages/
    Builder/                      # 主編輯頁（Topbar / BuilderPanel / sections / EditModeBar / 預覽）
    History/                      # 歷史頁（本輪深色重寫）
  styles/tokens.scss              # ★ 設計 token 單一來源；禁止 magic number
  App.tsx                         # hash router：#/(Builder) #/history #/quote/{no}
```

**前端 state 模型**：`useReducer` + Context（`QuoteProvider` 在 hash router **之上**，所以切到 History 再回來、Builder 的草稿不會掉）。沒有 Redux/Zustand。

**路由**：`#/`=Builder、`#/history`=History、`#/quote/{quote_no}`=深連結載入（`App.tsx` 的 `QuoteLoader` 用 `getQuoteByNumber` → `load()` → `navigate('/',{replace})`）。

---

## 5. 重要決策與「陷阱」（接手前必讀）

### 5.1 報價單號 = 「存檔才配號」（Option B）— 本輪核心

**背景**：舊行為是「進 Builder / 重整就去後端 `POST /quotes/next-number` 配號」，但那個 endpoint 是**消耗型配號器**（每呼叫一次序號 +1）→ 使用者一直重整就一直燒號。

**現在的設計**：
- 進 Builder / 重整 → 編號**空白**（placeholder「（儲存後配發）」），完全不碰後端。
- 按「存到雲端」或「輸出 PDF」→ 後端 `Create` 在 `quote_no` 缺省時**原子配發**，回傳號碼 → 前端 `SET_SAVED` stamp 進 state → 顯示在欄位 + 預覽 + PDF。
- 後端 `handler.go`：`quoteNo == "" → h.repo.NextNumber(...)`。

**兩個容易誤踩的 guard（都在 `useSaveQuote.ts`）**：
- **stamp id/號碼** → 用 **instance-epoch**（`QuoteContext` 的 `instanceRef`，只在 newQuote/load/reset 時 +1，欄位編輯不變）。理由：存檔 in-flight 時若使用者改了欄位，仍要 stamp 已建立那筆的 id，否則下次存檔會 POST 第二筆 + 燒第二個號（Codex P2-1）。
- **顯示「已存到雲端」** → 用 **snapshot 物件 identity 的 dirty 檢查**（`latestState.current === snapshot`）。理由：in-flight 改了欄位代表最新內容沒進 DB，不能假裝已存（Codex P2-B）。
- ⚠️ 這兩件事**故意分開**。別把它們合成同一個判斷，否則會復發 P2-1 或 P2-B。

> `POST /api/quotes/next-number` endpoint 還在（後端 + `frontend/src/api/quotes.ts` 的 `nextQuoteNumber`），但 **前端已不再呼叫**（Option B 後變成 dead code，留著無害，未來若要做「預覽號」可用；要清的話是獨立小任務）。

### 5.2 編輯預覽（contenteditable）+ React reconciliation —「P2-A 誤判」的教訓

- 「編輯預覽」是 **DOM-only**（不寫回 state），列印時的視覺覆寫，跟 legacy 一樣。
- Codex 兩度警告「首次存檔配號的 re-render 會洗掉編輯預覽的 DOM 修改」→ **用 Playwright 實測證明是誤判**：React reconciliation 只 patch「rendered 值有變」的節點（即號碼節點），其他 contenteditable 編輯**存活**。靜態 + 動態節點各測一次，存檔同時改了 id + quoteNo，編輯都沒被洗掉。
- 教訓：**review 回饋要驗證再接受**（Iron Law 5）。別因為註解寫得嚇人就盲改。

### 5.3 其他紀律（沿用全域 / 專案 CLAUDE.md）

- **`legacy.html` 是 1:1 復刻的 source of truth**。「做到的地方要跟原本長得一模一樣」。History 頁這次就是因為早期沒照 legacy（做成淺色）才要返工。
- **樣式只用 `tokens.scss` 變數**，禁止 magic number；互動元件用 Radix 包裝。
- **Commit 前必跑 Codex review**（`/codex:review` 或 `codex-companion.mjs review --scope working-tree`）→ findings 整理成表 → **使用者拍板** → 才修 → 才 commit。純 docs commit 可跳過 Codex。
- **進度儀表板 gate**：寫程式前先讀/建 `progress.json`，持續維護；產生 `progress.html`：
  `python3 scripts/render_progress.py progress.json progress.html`。
- **Bash**：別用 `cd && git` 複合指令（會觸發 bare-repo 防護）；用 `git -C <path>`。
- **Codex 雜訊**：mjs 輸出有 `rmcp::transport` / `worker quit` 噪音，用 `grep -v` 濾掉；判決用 `awk '/# Codex Review/{flag=1} flag{print}'` 抽。

---

## 6. 待辦 / 下一步（明確順序）

### 立即（這個 PR 收尾）
1. **PR #7 已 push**：branch `feature/session-3-preview` 已更新到 `80c2a5d`。
2. **/qa-only 正式 QA gate 已通過**：frontend lint / 276 tests / typecheck / build，backend `go vet` / `go test`，以及 Playwright live smoke。
3. **等待 GitHub policy 放行 merge**：目前 `gh pr merge 7 --merge` 被 base branch policy 擋下；auto-merge repository setting 未開。需 reviewer / admin 完成 merge `main`。

### 中期（部署鏈，最大未完成區塊）
4. **PR6 — GCP infra 一次性**：WIF（github-pool/provider）、Cloud SQL `quote-db`（database `quotes_prod` / `quotes_staging`）、Artifact Registry、Secret Manager（db 密碼）、**IAP**（限 `domain:artogo.co`）。腳本骨架在 `infra/`（目前只有 README）。
5. **PR7 — CI/CD staging**：`.github/workflows/ci.yml`（PR lint/test/build）+ `deploy-staging.yml`（push `staging` → 建 image → goose up → `gcloud run deploy` staging → smoke）。**目前 `.github/workflows/` 是空的，要從零建。**
6. **PR8 — CI/CD prod**：`deploy-prod.yml`（push `main`，min-instances=1）+ `main` 分支保護（必過 CI、1 reviewer、禁 force push）。

### 收尾
7. **PR9 — 業務 cutover**：公告新網址、帶第一位業務走 IAP 登入、舊 GitHub Pages 放橫幅指向新站、2 週後退場。

### 文件缺口（順手補）
- `CLAUDE.md` 引用了 `docs/ARCHITECTURE.md`、`docs/DESIGN_SYSTEM.md`、`docs/DEPLOY.md`，但**這三個檔還沒建**。部署做完時一起補。

---

## 7. 未覆蓋 / 風險（progress.json `not_covered` 同步）

- **IAP @artogo.co 登入流程** — 需 PR6 部署出 staging URL 後才能測。
- **Cross-browser**（Safari / Firefox / Edge）— 目前只在 Chromium/Playwright 驗過。
- **列印 PDF 在 staging/prod 的 1:1 視覺比對** — 本機已驗版面，prod 環境未驗。
- **並發配號真實壓測** — 後端原子配號已實作 + 單機驗證，多業務同時存檔未壓測。
- **存檔失敗 / 網路中斷 UX** — 有「儲存失敗」狀態，但未實地 dogfood 各種失敗情境。
- **PR #7 merge 被 branch policy 擋下** — 需 reviewer / admin 依 GitHub 設定完成合併。

---

## 8. 本輪驗證證據

**Option B（存檔配號）**：
- DB 序號計數器：`quote_serials`（date_key `260521`）→ 4 次重整前後 `next_seq` 維持 **85**（重整 0 消耗）；存檔一次 → **86**（只有存檔前進）。
- Playwright：mount/重整編號空白；存「存到雲端」→ 配發 `AW-260521-085` 並 stamp 進欄位 + 預覽兩處；後端 `POST /api/quotes` 無 `quote_no` → `201 + quote_no`。
- 回歸測試 `useSaveQuote.test.tsx`：in-flight 編輯後仍 stamp（下次走 PUT，僅一次 POST）；新報價 mid-create 不 stamp；clean save → `saved`、dirty → `idle`。

**History 1:1 深色復刻**：
- computed style：`screenBg rgb(13,8,4)=#0D0804`、title `rgb(186,153,114)=金`、tableWrap `rgb(26,21,16)=#1A1510`、draft pill `rgb(154,139,122)=#9A8B7A`、5 chip（全部 pressed）、logo/副標/重設/回 Builder 皆在。
- 截圖與 legacy 深色頁一致（差異僅資料：真實後端 vs mock）。

**Gate**：276 frontend tests / typecheck / lint / build 全綠；後端 `go vet` + `go test ./...` 綠；**Codex 最終 review：clean**。

---

## 9. 指令速查

```bash
# 前端 gates（改前端後）
cd frontend && npm run typecheck && npm run lint && npm test -- --run && npm run build

# 後端 gates（改後端後）
cd backend && go vet ./... && go test ./... && docker compose up -d --build server

# Codex pre-commit review（commit 前必跑）
node "/Users/peterting/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs" \
  review --scope working-tree 2>&1 | grep -v "rmcp::transport\|worker quit"

# 進度儀表板
python3 scripts/render_progress.py progress.json progress.html

# 看本機未 push 的 commit
git -C . log --oneline origin/feature/session-3-preview..HEAD

# Dev DB 清空重來
cd backend && docker compose down -v && docker compose up -d
```

---

## 10. 參考檔案

| 檔案 | 內容 |
|---|---|
| `CLAUDE.md`（repo 根） | AI / 協作守則、禁止項、改前後端流程、design system |
| `docs/HISTORY_BACKEND_SPEC.md` | 後端 API 黑盒規格（含 §3.5a by-number）|
| `docs/LOCAL_DEV.md` | 本機 docker compose 一鍵起 |
| `frontend/legacy.html` | 1:1 復刻 source of truth（舊版單檔）|
| `progress.html` / `progress.json` | 視覺化進度儀表板（單一資料來源）|
| `~/.claude/plans/history-backend-spec-md-rosy-willow.md` | 原始完整重構 plan（v2）|
| PR [#7](https://github.com/ARTOGO/Artway-quote-system/pull/7) | 目前開著的 PR（Session 3–5）|

---

_接手後若改了流程 / 架構，請同步更新本檔與 `progress.json`。_
