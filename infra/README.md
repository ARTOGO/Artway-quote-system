# GCP Infra — Artway Quote System

> 一次性 GCP 資源 setup。本資料夾的腳本要在 PR 6 補完整實作。

## 目前狀態：佔位

完整 setup script 會在 **PR 6 (GCP infra setup)** 補上，包含：

- `setup-wif.sh` — Workload Identity Federation（GitHub Actions OIDC → GCP）
- `setup-cloudsql.sh` — Cloud SQL Postgres instance + `quotes_prod` / `quotes_staging` databases
- `setup-iap.sh` — IAP for Cloud Run + 限制 `@artogo.co` workspace 域
- `setup-secrets.sh` — Secret Manager 內建 `db-password-{prod,staging}`
- `setup-artifact-registry.sh` — Artifact Registry repo for Docker images
- `setup-service-accounts.sh` — `github-actions-deployer` / `quote-app-runtime` 兩個 SA + IAM

## 預估月費

| 服務 | 月費 |
|---|---|
| Cloud Run prod (min-instances=1) | $5-$10 |
| Cloud Run staging (scale-to-zero) | $0-$2 |
| Cloud SQL db-f1-micro | $9 |
| Artifact Registry / Secret Manager / IAP | $0-$2 |
| **總計** | **約 $15-$25/月** |

## 先決條件

- GCP project 已建立並 enable billing
- `gcloud` CLI 已裝且登入 owner / editor 帳號
- GitHub repo `ARTOGO/Artway-quote-system` 存在
- Workspace 已設定（`@artogo.co` 域名）

詳細執行步驟見 PR 6。
