-- Quote-app SQL queries（sqlc input）
-- 每個 query 用 `-- name: XxxQuery :one/many/exec` 註解標記、sqlc 會生對應 Go 函式
--
-- 設計原則：
-- · NextNumber 用 PostgreSQL atomic INSERT...ON CONFLICT...RETURNING（不需 lock）
-- · 所有查詢都過濾 deleted_at IS NULL（軟刪除不可見）
-- · ListQuotes 用 nullable params 實現可選 filter（NULL = 不過濾該欄）

-- name: NextNumber :one
-- 配發下一個流水號 (atomic, race-free)。回上一個 next_seq 即「剛配發的值」。
-- 例：date_key='260515', 連跑 3 次回 1, 2, 3。
INSERT INTO quote_serials (date_key, next_seq)
VALUES ($1, 2)
ON CONFLICT (date_key) DO UPDATE
  SET next_seq = quote_serials.next_seq + 1
RETURNING next_seq - 1 AS issued_seq;

-- name: CreateQuote :one
-- 建立新報價。issue_date 可為 NULL（前端有時還沒選日期就先 save draft）。
-- created_by 跟 updated_by 都填同一個 email（建立 = 第一次修改）。
INSERT INTO quotes (
  quote_no, status, title, total_amount,
  client_company, sales_name, issue_date,
  body, created_by, updated_by
) VALUES (
  $1, $2, $3, $4,
  $5, $6, $7,
  $8, $9, $9
)
RETURNING id, quote_no, created_at, updated_at;

-- name: UpdateQuote :one
-- 更新報價（依 spec §3.3：忽略 body 內 quote_no，後端不改該欄）。
-- updated_at 自動 now()。回 :one 而非 :exec 以驗證該筆未被軟刪除（找不到 = err）。
UPDATE quotes SET
  status         = $2,
  title          = $3,
  total_amount   = $4,
  client_company = $5,
  sales_name     = $6,
  issue_date     = $7,
  body           = $8,
  updated_by     = $9,
  updated_at     = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING id, quote_no, updated_at;

-- name: ListQuotes :many
-- 列表（依 spec §3.4：updated_at DESC、軟刪除不返回、metadata only 不含 body）。
-- Filter 用 nullable params：傳 NULL 表示不過濾該欄位。
SELECT
  id, quote_no, status, title, total_amount,
  client_company, sales_name, issue_date, updated_at
FROM quotes
WHERE deleted_at IS NULL
  AND (sqlc.narg('date_from')::date  IS NULL OR issue_date >= sqlc.narg('date_from')::date)
  AND (sqlc.narg('date_to')::date    IS NULL OR issue_date <= sqlc.narg('date_to')::date)
  AND (sqlc.narg('sales_name')::text IS NULL OR sales_name  = sqlc.narg('sales_name')::text)
  AND (sqlc.narg('status')::text     IS NULL OR status      = sqlc.narg('status')::text)
ORDER BY updated_at DESC
LIMIT  $1
OFFSET $2;

-- name: CountQuotes :one
-- 配 ListQuotes 用於 pagination total 欄位。filter 條件必須跟 ListQuotes 完全一致。
SELECT COUNT(*)
FROM quotes
WHERE deleted_at IS NULL
  AND (sqlc.narg('date_from')::date  IS NULL OR issue_date >= sqlc.narg('date_from')::date)
  AND (sqlc.narg('date_to')::date    IS NULL OR issue_date <= sqlc.narg('date_to')::date)
  AND (sqlc.narg('sales_name')::text IS NULL OR sales_name  = sqlc.narg('sales_name')::text)
  AND (sqlc.narg('status')::text     IS NULL OR status      = sqlc.narg('status')::text);

-- name: GetQuote :one
-- 取單筆完整資料（含 body JSONB），軟刪除的視為不存在（pgx.ErrNoRows）。
SELECT *
FROM quotes
WHERE id = $1 AND deleted_at IS NULL;

-- name: GetQuoteByNo :one
-- 用報價單號取單筆完整資料，保留 #/quote/AW-... deep-link 書籤（業務 deep link）。
-- quote_no 有 UNIQUE 約束，最多一筆；軟刪除的視為不存在（pgx.ErrNoRows）。
SELECT *
FROM quotes
WHERE quote_no = $1 AND deleted_at IS NULL;

-- name: SoftDeleteQuote :execrows
-- 軟刪除（標記 deleted_at = now()）。:execrows 回 affected rows，handler 用來
-- 區分「刪除成功」與「找不到 / 已被刪過」(回 0 rows → 404)。
UPDATE quotes
SET deleted_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- name: DistinctSales :many
-- 不重複業務名單（給前端歷史頁 filter dropdown 用）。
-- 過濾空字串避免「未填業務」也算一個選項。
SELECT DISTINCT sales_name
FROM quotes
WHERE deleted_at IS NULL AND sales_name <> ''
ORDER BY sales_name;
