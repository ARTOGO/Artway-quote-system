# 本機開發指南（quote-app backend）

> Go 1.26 + Postgres 16 + chi + pgx + sqlc + goose
> 5 分鐘從零到能跑

---

## 前置需求

- Docker Desktop（或 OrbStack / Colima）
- Go 1.26+（本機編譯、跑 unit tests 用）
- 可選：sqlc 1.31+（只有改 SQL queries 要 regenerate 時用）
- 可選：goose 3.27+（手動跑 migrations，docker-compose 已內含）

```bash
# macOS
brew install go sqlc goose
brew install --cask docker
```

確認版本：

```bash
go version       # 應該 ≥ 1.26
docker version
sqlc version     # 1.31+
goose -version   # 3.27+
```

---

## 一鍵起整套

```bash
cd backend
docker compose up
```

服務跑起來：

- **Postgres 16** on `localhost:5432`（user `quote_app` / db `quotes`）
- **Migrations** 自動跑 `migrations/0001_init.sql`（goose 容器執行完即退出）
- **Server** on `localhost:8080`（ENV=dev、DEV_USER_EMAIL=dev@artogo.co）

驗證：

```bash
curl http://localhost:8080/healthz
# {"status":"ok"}

curl http://localhost:8080/readyz
# {"status":"ready"}

curl http://localhost:8080/api/me
# {"email":"dev@artogo.co"}   ← dev bypass、不需 IAP header

curl -X POST http://localhost:8080/api/quotes/next-number
# {"quote_no":"AW-260516-001"}
```

---

## 開發 loop（不用 docker-compose 跑 server，直接本機跑 go）

更快的 reload：Postgres 跑 container、server 跑本機 `go run`。

```bash
# Terminal 1: 只起 Postgres（不起 server）
cd backend
docker compose up postgres migrate

# Terminal 2: 跑本機 server（任何 .go 改完 Ctrl+C 後重跑）
cd backend
cp .env.example .env  # 第一次
export $(cat .env | xargs)
go run ./cmd/server
```

或裝 [`air`](https://github.com/air-verse/air) 自動 reload：

```bash
go install github.com/air-verse/air@latest
cd backend
air
```

---

## 跑測試

```bash
cd backend

# Unit tests（不需 Postgres、毫秒完成）
go test ./...

# Verbose 看每個 test
go test -v ./...

# Race detector（CI 必跑）
go test -race ./...

# Coverage
go test -cover ./...
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out -o coverage.html
```

整合測試（連真 Postgres）— **Phase A deploy 後補**，目前留 staging smoke test 驗。

---

## 改 SQL queries

1. 編輯 `backend/internal/quotes/queries.sql`
2. 跑 `sqlc generate`（在 backend/ 目錄下）
3. `backend/internal/quotes/sqlcgen/` 內檔自動 regenerate
4. 改 `backend/internal/quotes/repo.go` 對應 wrapper
5. 改 `handler.go` / `handler_test.go` 必要時
6. `go vet ./... && go test ./...`

---

## 加新 migration

1. 在 `backend/migrations/` 新增 `0002_xxx.sql`（**禁止改既有 migration**）
2. 跑 `docker compose up migrate` 套用到本機 DB（已存在的 0001 不重跑）
3. 跑 `sqlc generate` 確保 schema 跟 queries 對齊

或本機直接：

```bash
cd backend
goose -dir migrations postgres "postgres://quote_app:dev_password@localhost:5432/quotes?sslmode=disable" up
```

回滾：

```bash
goose -dir migrations postgres "..." down
```

---

## 重設整個 DB

```bash
cd backend
docker compose down -v       # -v 砍 pgdata volume
docker compose up
```

或只重跑 migrations（保留 DB schema 結構但清資料）：

```bash
docker compose exec postgres psql -U quote_app -d quotes -c "TRUNCATE quotes, quote_serials"
```

---

## 環境變數

| 變數 | 預設 | 說明 |
|---|---|---|
| `PORT` | `8080` | HTTP 監聽 port（Cloud Run 注入）|
| `DATABASE_URL` | (required) | pgx-compatible Postgres URI |
| `ENV` | `dev` | `dev` / `staging` / `prod`；`dev` 開啟 DEV_USER_EMAIL bypass |
| `DEV_USER_EMAIL` | — | `ENV=dev` 時用此 email 模擬 IAP user（required when dev）|

詳見 `backend/internal/config/env.go`。

---

## 認證行為（dev vs prod）

### Dev（本機）
- IAP 不存在
- `DEV_USER_EMAIL` env var → 視為當前 user
- **不信** client 送的 `X-Goog-Authenticated-User-Email` header（避免本機留 RCE）

### Staging / Prod
- GCP IAP 在 LB 層擋未登入請求
- IAP 通過 → 注入 `X-Goog-Authenticated-User-Email: accounts.google.com:peter@artogo.co`
- 後端 strip 前綴拿 `peter@artogo.co`
- Cloud Run 設 `ingress=internal-and-cloud-load-balancing` 避免繞 IAP 直打 .run.app

---

## 常見問題

### Q. `pg_isready` 一直 unhealthy
A. Port 5432 被佔走（本機已有 Postgres / 別專案的 docker）。

```bash
lsof -i :5432
```

改 `docker-compose.yml` port 為 `5433:5432`、更新 DATABASE_URL。

### Q. `go build` 失敗 — toolchain
A. Go < 1.26 看 go.mod 寫 `go 1.26` 應該自動下載 toolchain。若沒：

```bash
export GOTOOLCHAIN=auto
brew upgrade go    # 或本機升 Go 1.26+
```

### Q. `sqlc generate` 報錯 — queries.sql 跟 schema 對不上
A. 改完 SQL 後 schema 跟 queries 都要對齊。檢查 `migrations/0001_init.sql` 跟 `queries.sql` 的欄位名 / type 一致。

### Q. 改完 query 但 generated code 沒更新
A. 沒跑 `sqlc generate`。每次改 `queries.sql` 都要跑。

### Q. 本機 curl 401
A. ENV 不是 `dev`。確認 `echo $ENV` 是 `dev`、或 docker-compose 環境有 `ENV: "dev"`。

---

## 部署相關（不在本機文件範圍）

- **Phase A**：手動 gcloud 部署到 `artogo-v2`（PR 6 後改用 `artogo-infra//modules/internal-service`）
- **CI/CD**：GitHub Actions + Workload Identity Federation（PR 7-8 補）
- **Cloud SQL**：共用既有 `artogo-auth-db` instance、加新 database `quotes`

詳見：
- `infra/README.md` — GCP 一次性 setup
- `~/.claude/plans/artogo-internal-platform-base-plan.md` — Phase A→D
