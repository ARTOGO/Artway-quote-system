-- +goose Up
-- +goose StatementBegin

-- Quotes 表：對齊 docs/HISTORY_BACKEND_SPEC.md v2 黑盒子規格
-- · 外層 7 個查詢欄位（quote_no/status/title/total_amount/client_company/sales_name/issue_date）
-- · body JSONB 整包存（meta/client/sales/groups/deliverables/services/notes/payment）
-- · 系統欄位：id / created_by / updated_by / created_at / updated_at / deleted_at
CREATE TABLE quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_no        TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'signed', 'executed')),
  title           TEXT NOT NULL DEFAULT '',
  total_amount    BIGINT NOT NULL DEFAULT 0,
  client_company  TEXT NOT NULL DEFAULT '',
  sales_name      TEXT NOT NULL DEFAULT '',
  issue_date      DATE,
  body            JSONB NOT NULL,
  created_by      TEXT NOT NULL DEFAULT '',
  updated_by      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- Partial index：軟刪除的不會被 query 到、index 不浪費空間
CREATE INDEX idx_quotes_issue_date  ON quotes (issue_date)  WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_sales_name  ON quotes (sales_name)  WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_status      ON quotes (status)      WHERE deleted_at IS NULL;
CREATE INDEX idx_quotes_updated_at  ON quotes (updated_at DESC) WHERE deleted_at IS NULL;

-- 每日流水號 atomic 配發
-- date_key 用 CHAR(6) 對齊 YYMMDD 格式（2030-05-15 → '300515'）
-- next_seq 是「下次要配發的值」；NextNumber query 用 ON CONFLICT...DO UPDATE...+1
-- 並 RETURNING (next_seq - 1) 拿到剛配發的值
CREATE TABLE quote_serials (
  date_key  CHAR(6) PRIMARY KEY,
  next_seq  INTEGER NOT NULL DEFAULT 1
);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TABLE IF EXISTS quote_serials;
DROP TABLE IF EXISTS quotes;

-- +goose StatementEnd
