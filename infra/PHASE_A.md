# Phase A Infra Plan

Phase A deploys the ARTWAY quote system into the existing `artogo-v2` GCP
project. It does not create a new GCP project.

This phase is intentionally script-first. Terraform is deferred until the shared
`artogo-infra` module exists and the local Terraform version is upgraded.

## Current Discovery

Read-only discovery on 2026-05-22 found:

- Active account: `peter_ting@artogo.co`
- Target project: `artogo-v2` (`968864738717`)
- Current local default project: `excellent-tide-496207-r6`
- Region: `asia-east1`
- Artifact Registry Docker repo: `internal`
- Cloud SQL Postgres instance: `artogo-auth-db`
- Existing global URL map: `https`
- Existing HTTPS target proxy on `35.241.57.95`: `https-target-proxy-2`
- Existing WIF pool/provider suitable for this repo: `github-actions` / `github`
- Current Terraform: `1.5.7`, below the README target of `>= 1.15`

Because the local default project is not `artogo-v2`, every script passes
`--project=artogo-v2` explicitly.

## Resource Plan

| Area | Staging | Prod |
|---|---|---|
| Cloud Run service | `quote-app-staging` | `quote-app-prod` |
| Cloud SQL database | `quotes_staging` | `quotes_prod` |
| Cloud SQL user | `quote_app_staging` | `quote_app_prod` |
| Database URL secret | `quote-app-staging-database-url` | `quote-app-prod-database-url` |
| DB password secret | `quote-app-staging-db-password` | `quote-app-prod-db-password` |
| Serverless NEG | `quote-app-staging-neg` | `quote-app-prod-neg` |
| Backend service | `quote-app-staging-backend` | `quote-app-prod-backend` |
| Hostname | `quote-staging.artogo.co` | `quote.artogo.co` |

Shared resources:

- Runtime service account: `quote-app-runner@artogo-v2.iam.gserviceaccount.com`
- Artifact image: `asia-east1-docker.pkg.dev/artogo-v2/internal/quote-app:<tag>`
- Managed certificate: `quote-app-cert`
- URL map: `https`
- HTTPS target proxy: `https-target-proxy-2`

## Packaging Prerequisite

The repository now has a root `Dockerfile` for the production Cloud Run image.
It builds the frontend with pnpm, copies `frontend/dist` into
`backend/internal/static/dist`, then compiles the Go binary with the React build
embedded.

The old `backend/Dockerfile` remains a backend-only development image.

## Scripts

Read-only preflight:

```bash
infra/scripts/phase-a-preflight.sh
```

Dry-run setup plan:

```bash
infra/scripts/phase-a-setup.sh
```

Apply setup:

```bash
cp infra/phase-a.env.example infra/phase-a.env
infra/scripts/phase-a-setup.sh --apply
```

The setup script refuses to write GCP resources unless `--apply` is present.
When applying, the image build uses `docker buildx --platform=linux/amd64
--provenance=false --push` because Cloud Run requires an amd64/linux runnable
manifest, not only a local Docker Desktop OCI image index.

For PostgreSQL, `--apply` also grants each runtime role ownership and privileges
for its database and `public` schema:

- `quotes_staging` -> `quote_app_staging`
- `quotes_prod` -> `quote_app_prod`

That step is required before PR7 CI runs `goose up` with the same runtime
`DATABASE_URL`. Set either `DB_ADMIN_PASSWORD_SECRET` or `DB_ADMIN_PASSWORD` in
`infra/phase-a.env`; the script never prints the value. The local machine must
have `psql` because `gcloud sql connect` delegates to it.

Read-only verification after apply:

```bash
infra/scripts/phase-a-verify.sh
```

If DNS is not configured yet, use:

```bash
infra/scripts/phase-a-verify.sh --allow-missing
```

Deployment gap check before apply:

```bash
infra/scripts/phase-a-verify.sh --allow-missing
```

## IAP Notes

This plan uses IAP on the external Application Load Balancer backend services.
Google documents that load-balancer IAP protects traffic through the load
balancer, not direct `run.app` traffic. For that reason, Cloud Run is deployed
with `--ingress=internal-and-cloud-load-balancing`.

The setup script enables IAP with the Google-managed OAuth client by default.
That keeps access internal to the Google Cloud organization and avoids storing a
custom OAuth client secret. If ARTOGO later wants custom consent-screen branding
or external users, set `IAP_OAUTH_CLIENT_ID` and `IAP_OAUTH_CLIENT_SECRET`
locally before running `phase-a-setup.sh --apply`.

Google also documents that IAP needs Cloud Run Invoker on the Cloud Run service
through this service account:

```text
service-968864738717@gcp-sa-iap.iam.gserviceaccount.com
```

The script grants that principal `roles/run.invoker` on both quote-app Cloud Run
services.

Sources:

- https://docs.cloud.google.com/iap/docs/managed-oauth-client
- https://cloud.google.com/iap/docs/enabling-cloud-run
- https://cloud.google.com/iap/docs/load-balancer-howto

## Manual Steps Still Required

These are intentionally not fully automated yet:

- PR7 should automate goose migrations in CI/CD so future deploys do not need a
  manual Cloud SQL Auth Proxy session.
- Before business cutover, run the same browser smoke on
  `https://quote.artogo.co` after the deploy flow is automated.

Already applied manually on 2026-05-22:

- `quote-app-cert` is attached to `https-target-proxy-2` while preserving the
  existing certificate list.
- Cloudflare DNS records are present:
  - `quote-staging.artogo.co A 35.241.57.95`
  - `quote.artogo.co A 35.241.57.95`
- `quote-app-cert` is `ACTIVE` for both quote domains.
- `quotes_staging` and `quotes_prod` have applied
  `backend/migrations/0001_init.sql`.
- `https://quote-staging.artogo.co` passed browser smoke after `@artogo.co`
  IAP login: Builder loaded, saving a test quote issued `AW-260523-001`,
  History listed and deep-linked the quote, and the test quote was soft-deleted.

## Verification

After apply:

```bash
infra/scripts/phase-a-verify.sh
infra/scripts/phase-a-verify.sh --check-http
```

Expected:

- Direct `.run.app` access is blocked by Cloud Run ingress.
- `quote-staging.artogo.co` and `quote.artogo.co` return IAP-generated
  responses before login; `--check-http` intentionally does not follow the
  OAuth redirect to `accounts.google.com`.
- After login with an `@artogo.co` account, the Builder loads.
- `/readyz` returns ready in authenticated browser/runtime smoke after
  migrations are applied.

## Rollback

- Remove URL map host rules for `quote-staging.artogo.co` / `quote.artogo.co`.
- Disable IAP on `quote-app-staging-backend` / `quote-app-prod-backend`.
- Delete serverless NEGs and backend services if unused.
- Delete Cloud Run services if rollback is permanent.
- Keep Cloud SQL databases and secrets until data retention is reviewed.
