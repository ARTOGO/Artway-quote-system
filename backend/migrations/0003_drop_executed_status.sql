-- +goose Up
-- +goose StatementBegin

-- 業務端反映不使用「已執行」狀態(產品決定簡化 lifecycle 到 draft / sent /
-- signed / template)。上線前已確認資料庫沒有任何一筆 status='executed',
-- 因此直接收緊 CHECK constraint,不需要資料轉換。
--
-- 若未來有需求把「已執行」加回來,只需再開一個 migration ALTER CHECK 加回值即可。
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
