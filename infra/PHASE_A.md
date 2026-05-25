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
| Runtime service account | `quote-app-staging-runner` | `quote-app-prod-runner` |
| GitHub Actions deployer | `quote-app-staging-deployer` | `quote-app-prod-deployer` |
| Serverless NEG | `quote-app-staging-neg` | `quote-app-prod-neg` |
| Backend service | `quote-app-staging-backend` | `quote-app-prod-backend` |
| Hostname | `quote-staging.artogo.co` | `quote.artogo.co` |

Shared resources:

- Legacy shared runtime service account kept only for cleanup checks:
  `quote-app-runner@artogo-v2.iam.gserviceaccount.com`
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

## PR7 CI/CD

PR7 adds two GitHub Actions workflows:

- `.github/workflows/ci.yml`
  - runs on pull requests to `main` / `staging`
  - runs frontend typecheck, lint, tests, build
  - runs backend `go vet`, `golangci-lint run`, and `go test`
  - builds the production Docker image without pushing it
- `.github/workflows/deploy-staging.yml`
  - runs on push to `staging` or manual dispatch
  - authenticates to GCP through WIF
  - builds and pushes `quote-app:${GITHUB_SHA}` to Artifact Registry
  - runs `goose up` against `quotes_staging` through Cloud SQL Proxy
  - deploys `quote-app-staging`
  - smoke-checks Cloud Run ingress, DNS, and IAP-generated responses

The staging deployer service account is intentionally staging-scoped. It needs
these permissions:

- `roles/artifactregistry.writer` on Artifact Registry repo `internal`
- `roles/run.developer` on Cloud Run service `quote-app-staging`
- `roles/cloudsql.client`
- `roles/serviceusage.serviceUsageConsumer`
- `roles/iam.serviceAccountUser` on
  `quote-app-staging-runner@artogo-v2.iam.gserviceaccount.com`
- `roles/secretmanager.secretAccessor` on `quote-app-staging-database-url`

`phase-a-verify.sh` also checks that the staging deployer does not have project
`roles/run.admin`, project `roles/run.developer`, or project
`roles/iam.serviceAccountUser`, does not have Cloud Run deploy permissions on
`quote-app-prod`, cannot act as `quote-app-prod-runner` or the legacy
`quote-app-runner`, and cannot read `quote-app-prod-database-url`. The setup
script also removes those broad project-level grants from the staging deployer
when applying. The setup script also decommissions the legacy shared runtime by
removing its Cloud SQL client grant and database URL secret access. The runtime
identity checks assert that `quote-app-staging` runs as
`quote-app-staging-runner`, `quote-app-prod` runs as `quote-app-prod-runner`,
each active runtime service account can read only its own environment's
database URL secret, and the legacy `quote-app-runner` can read neither
database URL secret. WIF impersonation is scoped with a mapped
`attribute.workflow_ref` principalSet for
`ARTOGO/Artway-quote-system/.github/workflows/deploy-staging.yml@refs/heads/staging`;
the broad `attribute.repository` principalSet must be absent. The same verify
step checks that the old generic `github-actions-deployer` has neither binding.
The Cloud SQL and Service Usage grants are required because the PR7 migration
step connects through Cloud SQL Proxy and charges Cloud SQL Admin API quota to
`artogo-v2`.

## PR8 Prod Deployment

PR8 adds `.github/workflows/deploy-prod.yml`:

- runs on push to `main` or manual dispatch
- authenticates to GCP through WIF
- builds and pushes `quote-app:${GITHUB_SHA}` to Artifact Registry
- runs `goose up` against `quotes_prod` through Cloud SQL Proxy
- deploys `quote-app-prod` with `--min-instances=1`
- smoke-checks Cloud Run ingress, minScale, DNS, and IAP-generated responses

Production uses a separate deployer service account:

```text
quote-app-prod-deployer@artogo-v2.iam.gserviceaccount.com
```

That account is intentionally prod-scoped. It needs:

- `roles/artifactregistry.writer` on Artifact Registry repo `internal`
- `roles/run.developer` on Cloud Run service `quote-app-prod`
- `roles/cloudsql.client`
- `roles/serviceusage.serviceUsageConsumer`
- `roles/iam.serviceAccountUser` on
  `quote-app-prod-runner@artogo-v2.iam.gserviceaccount.com`
- `roles/secretmanager.secretAccessor` on `quote-app-prod-database-url`

The setup and verify scripts also assert the cross-environment boundary:

- `DEPLOYER_SA` and `PROD_DEPLOYER_SA` local overrides are rejected unless
  they match the service accounts hardcoded in the staging/prod workflows
- staging deployer cannot deploy `quote-app-prod`, act as
  `quote-app-prod-runner`, or read `quote-app-prod-database-url`
- prod deployer cannot deploy `quote-app-staging`, act as
  `quote-app-staging-runner`, or read `quote-app-staging-database-url`
- neither deployer has project-level `roles/run.admin`,
  `roles/run.developer`, or `roles/iam.serviceAccountUser`
- staging WIF is scoped to
  `ARTOGO/Artway-quote-system/.github/workflows/deploy-staging.yml@refs/heads/staging`
- prod WIF is scoped to
  `ARTOGO/Artway-quote-system/.github/workflows/deploy-prod.yml@refs/heads/main`
- broad repository-wide WIF bindings must be absent

Sources:

- https://docs.cloud.google.com/iap/docs/managed-oauth-client
- https://cloud.google.com/iap/docs/enabling-cloud-run
- https://cloud.google.com/iap/docs/load-balancer-howto

## Manual Steps Still Required

These are intentionally not fully automated yet:

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
