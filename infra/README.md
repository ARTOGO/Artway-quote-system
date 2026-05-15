# Infra — Artway Quote System

> Terraform-managed infrastructure for quote-app deployment on GCP Cloud Run.

## 目前狀態：佔位

實作會在後續 PR 補上。Quote-app 走「**加進既有 ARTOGO 內部平台**」策略，不另起爐灶。

## 部署策略（對齊 plan v2）

### Phase A（< 1 週）：quote-app 上線
直接加進既有 `artogo-v2` GCP project + 既有 LB（`35.241.57.95`）：

- 新 Cloud Run service：`quote-app-prod` + `quote-app-staging`
- 共用既有 Postgres instance `artogo-auth-db`、加新 database `quotes`
- 用既有 Artifact Registry `internal` repo
- 在既有 LB url-map `https` 加 host rule `quote.artogo.co` → quote-app NEG
- Managed cert 加 SAN `quote.artogo.co`
- GCP IAP（限 `@artogo.co` Workspace）
- Cloudflare 加 A record `quote.artogo.co` → `35.241.57.95`

本資料夾的 Terraform 在 Phase A **hardcode 寫資源定義、用 local state**。

### Phase B（1-3 週）：引用 `artogo-infra` module
[ARTOGO/artogo-infra](https://github.com/ARTOGO/artogo-infra) 補完 `modules/internal-service` 之後，本資料夾重構成：

```hcl
module "quote_app" {
  source = "github.com/ARTOGO/artogo-infra//modules/internal-service?ref=v0.1.0"
  
  name           = "quote-app"
  environment    = "prod"
  hostname       = "quote.artogo.co"
  allowed_domain = "artogo.co"
  database = { instance = "artogo-auth-db", name = "quotes", user = "quote_app" }
  image          = var.image
}
```

State 改用 `gs://artogo-tf-state/Artway-quote-system` backend。

### Phase C / D
- C：既有資源（LB / cert / SA / IAM）逐步 Terraform import
- D：（如真決定）遷移到全新 project

詳見：
- [`~/.claude/plans/artogo-internal-platform-base-plan.md`](../docs/) 平台整體 Phase A→D
- [ARTOGO/artogo-infra](https://github.com/ARTOGO/artogo-infra) 共用 module

## 預估月費（Phase A 後）

| 項目 | 月費 |
|---|---|
| quote-app Cloud Run prod (min-instances=1) | $5-10 |
| quote-app Cloud Run staging (scale-to-zero) | $0-2 |
| Cloud SQL `quotes` database (share `artogo-auth-db`) | share of $9 |
| Secrets / LB / Cert | $0 增量 |
| **Total** | **~$10/月** |

## 先決條件（執行 Phase A 前）

- gcloud CLI 已裝、登入 `peter_ting@artogo.co`（或具同等權限的 ARTOGO 帳號）
- terraform CLI ≥ 1.10
- GCP project `artogo-v2` 寫權限（roles/editor + roles/iap.admin）
- Cloudflare API token（管 `artogo.co` zone）

詳細執行步驟見後續 PR 內的 `infra/PHASE_A.md`。
