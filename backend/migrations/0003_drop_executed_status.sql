-- +goose Up
-- +goose StatementBegin

-- 業務端反映不使用「已執行」狀態(產品決定簡化 lifecycle 到 draft / sent /
-- signed / template)。
--
-- Update history: PM 一開始說沒有 'executed' 資料,但 staging DB 實際上仍有
-- 至少一筆遺留的 test row,導致收緊 CHECK 時被 SQLSTATE 23514 擋下,整條
-- deploy pipeline 掛掉。修正:UPDATE 先把 'executed' 資料歸類到 'signed'
-- (語意最接近 — 都算「已完結但沒繼續走」),再收緊 CHECK。整包在 goose
-- 的 transaction 內執行,失敗會 rollback。
--
-- 註:這份 migration 從未 apply 成功過(每次 attempt 都在 CHECK step 失敗
-- 並 rollback),因此就地修改是安全的、也是唯一實務做法(如果新開 0005,
-- 0003 仍然會炸,goose 就不會 run 到 0005)。
UPDATE quotes SET status = 'signed' WHERE status = 'executed';
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'signed', 'template'));

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

-- Reverse:恢復 0002 的 CHECK(含 executed)。
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status IN ('draft', 'sent', 'signed', 'executed', 'template'));

-- +goose StatementEnd
