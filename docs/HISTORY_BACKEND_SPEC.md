# ARTWAY 報價單系統 — 歷史紀錄後端規格

> 給後端工程師。前端已部署在 GitHub Pages，需新增「共享歷史紀錄」功能，由後端提供 API。

**前端網址**：https://artogo.github.io/Artway-quote-system/
**前端 repo**：https://github.com/ARTOGO/Artway-quote-system

---

## 1. 整體流程

```
[業務 A 瀏覽器]           [業務 B 瀏覽器]
       ↓                        ↓
       └─── HTTPS API ──────────┘
                 ↓
            [你的後端]
                 ↓
            [DB / Storage]
```

業務操作報價單系統時，前端會 call API：
- **新報價** → call 後端取流水號
- **儲存** → POST/PUT 整份報價 JSON 到後端
- **查歷史** → GET 列表 + 篩選
- **載入舊報價** → GET 單筆 → 帶回 Builder 編輯
- **刪除** → 軟刪除（藏起來不顯示）

---

## 2. 認證 / 權限

**Phase A 起走 GCP IAP**（Identity-Aware Proxy）— 員工身分驗證在網路層完成、後端不需要實作 auth 邏輯。

**後端要做的**：
- 讀 HTTP header `X-Goog-Authenticated-User-Email`（格式：`accounts.google.com:peter@artogo.co`，取冒號後段為 email）
- 用 email 寫入 `created_by` / `updated_by` 欄位做 audit
- **不要**自己驗 JWT、不要查 JWKS — IAP 已驗過

**本機開發**（`ENV=dev`）：bypass IAP、讀 env var `DEV_USER_EMAIL=peter@artogo.co` 模擬使用者。

**安全要求**：Cloud Run service 必須設 `ingress = internal-and-cloud-load-balancing`，拒絕從外部直接打 `.run.app` URL（否則繞過 IAP）。

### CORS

**Phase A（前後端合一 Cloud Run）**：同 origin、**不需要 CORS** 設定。

**未來若前後端分離部署**：`Access-Control-Allow-Origin: https://quote.artogo.co`（GET, POST, PUT, DELETE, OPTIONS）。

> ⚠️ 已棄用：舊版規格 allow `https://artogo.github.io`。新版用 Cloud Run + 自訂域名，不再對外開放跨域。

---

## 3. API 端點

### 3.1 取下一個流水號
```
POST /quotes/next-number
```
**邏輯**：依今日（**Asia/Taipei 時區**）已配發過的最大 NNN + 1，3 位數補零，每日歸零。
需要 atomic 操作避免 race condition。

> ⚠️ Cloud Run 預設 UTC、台灣晚上 8 點後（UTC 12:00 後）會跨日，必須明確用 Asia/Taipei 計算日期。Go 實作用 `time.Now().In(time.FixedZone("Asia/Taipei", 8*60*60))` 或 `time.LoadLocation("Asia/Taipei")`；PostgreSQL 用 `current_date AT TIME ZONE 'Asia/Taipei'`。

**Response 200:**
```json
{ "quote_no": "AW-260514-007" }
```

格式：`AW-YYMMDD-NNN`

---

### 3.2 建立報價
```
POST /quotes
Content-Type: application/json
Body: <Quote JSON> (見第 4 節 schema)
```

**Response 201:**
```json
{
  "id": "<server-generated id>",
  "quote_no": "AW-260514-007",
  "created_at": "2026-05-14T10:23:00Z",
  "updated_at": "2026-05-14T10:23:00Z"
}
```

---

### 3.3 更新報價（覆蓋）
```
PUT /quotes/{id}
Body: <Quote JSON>
```

> 業務 A 跟 B 同時編輯同一筆 → **後存的覆蓋前存的**（不需 lock 機制）。

> **注意**：`quote_no` 是該筆報價的永久 ID，更新時請**忽略** body 裡的 quote_no（即使前端傳了也不要改）。`meta.issue_date` 則允許每次更新時變動（業務可能載入舊單後把開立日期改成今天）。

**Response 200:**
```json
{ "id": "...", "updated_at": "..." }
```

---

### 3.4 列表（含篩選 + 分頁）
```
GET /quotes?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&sales_name=...&status=draft&page=1&page_size=20
```

**Query params（皆為可選）：**
- `date_from`, `date_to` — issue_date 範圍
- `sales_name` — 業務名稱（完全比對）
- `status` — `draft` / `sent` / `signed` / `executed`
- `page`（預設 1）, `page_size`（預設 20）

**排序：** 預設 `updated_at DESC`（最新優先）
**不返回**：已軟刪除的（`deleted_at IS NOT NULL`）

**Response 200:**
```json
{
  "items": [
    {
      "id": "...",
      "quote_no": "AW-260514-007",
      "title": "故宮博物院主題策展頁",
      "client_company": "台灣當代藝術館",
      "sales_name": "王志遠",
      "issue_date": "2026-05-14",
      "total_amount": 445200,
      "status": "draft",
      "updated_at": "2026-05-14T10:30:00Z"
    },
    ...
  ],
  "total": 142,
  "page": 1,
  "page_size": 20
}
```

> 列表返回 metadata 即可（不含完整 groups/items 詳細）— 點筆才 GET /quotes/{id} 拿完整。

---

### 3.5 取單筆完整資料
```
GET /quotes/{id}
```

**Response 200:** 完整 Quote JSON（見第 4 節）

**Response 404:** `{ "error": "not found" }`

---

### 3.5a 用報價單號取單筆（deep-link 書籤）
```
GET /quotes/by-number/{quote_no}
```

前端 deep-link 路由是 `#/quote/AW-...`（報價單號，保留業務書籤），但內部主鍵是
UUID，列表也不支援用 quote_no 篩選。此端點讓 `#/quote/AW-...` 能直接重新載入。

- `quote_no` 有 `UNIQUE` 約束，最多一筆；軟刪除視為不存在。
- **Response 200:** 與 3.5 完全相同的合併後 Quote JSON（7 個 canonical 外層欄位
  覆寫 body）。
- **Response 404:** 找不到或已軟刪除。
- **Response 400:** `quote_no` 為空。

> 路由註冊順序：`/by-number/{quote_no}` 為字面前綴，必須在 `/{id}` catch-all 之前
> 註冊（見 `routes.go`）。

---

### 3.6 軟刪除
```
DELETE /quotes/{id}
```

**邏輯**：標記 `deleted_at = now()`，不真的刪除資料。後續 list 不會回傳。

**Response 204:** 無 body

---

## 4. 報價單 JSON Schema

> **後端對 Quote JSON 採黑盒子原則**：除了下面這 7 個欄位外，**其他內容後端不需要解析**，整包當 JSON 字串/JSONB 存進去、拿出來原樣回前端即可。前端未來新增欄位（折讓、手續費、分期等）都不會影響後端。

### 4.1 後端需要解析的「外層 7 個欄位」

| 欄位 | 來源 | 用途 |
|---|---|---|
| `id` | 後端產生（POST 時） | 主鍵 |
| `quote_no` | 後端 3.1 配發 / 前端帶入 | 列表顯示、PUT 時**不可變動**（忽略 body 裡的 quote_no） |
| `status` | 前端帶入 | 列表 filter（`draft`/`sent`/`signed`/`executed`） |
| `title` | 前端從 `meta.title` 複製過來 | 列表顯示專案名稱（可空字串） |
| `total_amount` | 前端**自己算好**帶入 | 列表顯示金額 |
| `client_company` | 前端從 `client.company` 複製過來 | 列表 filter / 顯示 |
| `sales_name` | 前端從 `sales.name` 複製過來 | 列表 filter / 顯示 |
| `issue_date` | 前端從 `meta.issue_date` 複製過來 | 列表 filter / 顯示（YYYY-MM-DD） |
| `created_at` / `updated_at` / `deleted_at` | 後端產生 | 排序、軟刪除 |

> 前端會把上面這些欄位放在 Quote JSON 的**外層**（跟 `groups`、`client` 平行）。後端只需從外層讀這幾個欄位、寫進對應 DB 欄位即可，不用挖進 `meta` / `client` / `sales` 裡面找。

### 4.2 範例請求

```json
{
  "quote_no": "AW-260514-007",
  "status": "draft",
  "title": "故宮博物院主題策展頁",
  "total_amount": 445200,
  "client_company": "故宮博物院",
  "sales_name": "王志遠",
  "issue_date": "2026-05-14",

  // ─── 以下後端不解析、原樣存就好 ───
  "meta": { "...": "..." },
  "client": { "...": "..." },
  "sales": { "...": "..." },
  "groups": [ /* 任意結構，可能 50KB+ */ ],
  "deliverables": [],
  "services": [],
  "notes": [],
  "payment": {}
}
```

### 4.3 注意

- 整份 JSON 可能 50KB ~ 500KB
- 建議 DB 設計：一個 `quotes` 表，欄位 = 上述 7 個外層 + 一個 `body JSONB`（或 `body TEXT` 存整包 JSON 字串）
- GET 單筆時，把 7 個欄位拼回外層、附上 `body` 內容一起回給前端

---

## 5. 錯誤格式

```json
{ "error": "human readable message", "code": "OPTIONAL_CODE" }
```

**HTTP status：** 標準 REST（200/201/204/400/404/500）

前端 fallback 策略：**API 失敗直接報錯給業務**（不退回 localStorage）。

---

## 6. 規模 / 規格預估

| 項目 | 數量 |
|---|---|
| 同時在線業務 | ~10 |
| 每日新報價 | 10–30 筆 |
| 一年累積 | ~5000 筆 |
| 單筆 JSON 大小 | 50KB – 500KB |
| 預估總儲存 | < 5GB |
| QPS | 極低（< 5/sec） |

**SLA：** 一般情況可用即可，無需高可用。

---

## 7. 給工程師的 Checklist

部署完成後請提供以下資訊回給 PM：

- [ ] **API base URL**（例：`https://api.artway.com/quotes`）
- [ ] CORS 是否已允許 `https://artogo.github.io`
- [ ] 是否需要 token / IP 限制（如有，怎麼帶）
- [ ] 範例 curl call 確認可用：
  - `curl -X POST <base>/next-number` 應拿到流水號
  - `curl -X GET <base>` 應拿到（空的）列表
- [ ] 異常通知管道（後端掛了你會知道）
- [ ] 資料備份頻率

---

## 8. 後續維護

部署後若 PM 端 / 前端要新增功能：
- 前端：PM 端改 HTML，雙擊 `deploy.bat` 上版到 GitHub Pages，**不用動後端**
- 後端：工程師那邊也不用動（除非要新增 API 邏輯）

兩端透過上述 API 規格獨立演進。

---

## 變更歷史
| 日期 | 版本 | 變更 |
|---|---|---|
| 2026-05-15 | v1 | 初版規格 |
| 2026-05-15 | v1.1 | 列表回傳新增 `title` 欄位；補註 `quote_no` 為永久 ID（PUT 時不應變動）|
| 2026-05-15 | v1.2 | `groups[]` 新增 `hasAdjustment` / `adjustment {label, amount}` 欄位（議價/手續費，可為負數）|
| 2026-05-15 | v2 | **重構為黑盒子模式**：後端只解析外層 7 個欄位（quote_no/status/title/total_amount/client_company/sales_name/issue_date），其餘內容原樣存取。前端自己算 `total_amount`。後端未來不會因前端 schema 變動而需要改動。|
