-- +goose Up
-- +goose StatementBegin

-- 業務新增「流失」狀態:報價案沒有簽成、客戶轉單、預算被砍等情境。
-- 用途:結案盤點時業務可以標記哪些案子最終沒進來,便於統計成交率。
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'signed', 'template', 'lost'));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- 若有 lost 狀態的資料,先降級成 draft 以免被 CHECK 擋住。
UPDATE quotes SET status = 'draft' WHERE status = 'lost';
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'signed', 'template'));

-- +goose StatementEnd
