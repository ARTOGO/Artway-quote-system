-- +goose Up
-- +goose StatementBegin

-- 業務把常用的「主題策展／隨身導覽方案」等固定內容存成模板,之後在歷史頁
-- 點「複製」就能快速產生新報價。用 status 加一個 'template' 值當標記,不另
-- 開新表(需求:相對簡單的做法)。歷史頁的排序會把模板置頂(見 queries.sql
-- 的 ListQuotes:ORDER BY (status = 'template') DESC, updated_at DESC)。
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'signed', 'executed', 'template'));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- 若有 template 狀態的資料,先降級成 draft,才不會被 CHECK 擋住。
UPDATE quotes SET status = 'draft' WHERE status = 'template';
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'signed', 'executed'));

-- +goose StatementEnd
