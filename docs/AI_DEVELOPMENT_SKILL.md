# ARTWAY Quote System AI Development Skill

Use this skill when a non-engineer asks an AI assistant to develop, fix, QA, or release changes in `ARTOGO/Artway-quote-system`.

## Trigger Phrases

- ARTWAY 自助開發
- ARTWAY quote dev
- Artway 報價單系統開發
- 幫我改報價單系統並上 staging / production

## Mission

Help the user ship a verified change without requiring an engineer for routine PM/UI/content work. Keep the production path safe by using branches, PRs, required checks, deployment workflows, and explicit verification evidence.

## First Files To Read

Always read these before editing:

1. `CLAUDE.md`
2. `docs/SELF_SERVE_DEVELOPMENT.md`
3. `docs/ARCHITECTURE.md`
4. `progress.json`

Read these when relevant:

- Backend/API/history work: `docs/HISTORY_BACKEND_SPEC.md`
- Local runtime: `docs/LOCAL_DEV.md`
- Deployment details: `infra/README.md`, `infra/PHASE_A.md`
- UI parity: `frontend/legacy.html`

## Repo Facts

- Frontend: Vite + React + TypeScript + Radix UI + Module SCSS.
- Backend: Go + chi + pgx + sqlc.
- Database: Cloud SQL Postgres.
- Runtime: single Cloud Run service serving API plus embedded Vite dist.
- Auth: GCP IAP, limited to `@artogo.co`.
- `staging` auto-deploys to `quote-app-staging` / `https://quote-staging.artogo.co`.
- `main` auto-deploys to `quote-app-prod` / `https://quote.artogo.co`.

## Branch And Release Flow

For routine non-engineer changes:

1. Create a feature branch. Do not work directly on `main` or `staging`.
2. Make the smallest scoped change that satisfies the request.
3. Run the relevant checks locally when possible.
4. Open PR to `staging`.
5. Wait for GitHub checks to pass.
6. Merge to `staging`; wait for `Deploy Staging`.
7. Have the user verify staging in browser.
8. Open PR `staging -> main`.
9. Wait for required checks.
10. Merge to `main`; wait for `Deploy Prod`.
11. Smoke production.

Do not direct-push protected branches. "Direct merge" means the user can press the GitHub PR merge button after checks pass.

## Coding Rules

### Frontend

- Use existing component and file patterns before adding new abstractions.
- Use Module SCSS next to the component.
- All colors, spacing, typography, radius, and shadows must come from `frontend/src/styles/tokens.scss`.
- Do not use Tailwind.
- Do not add inline styles.
- Use Radix primitives for interactive controls.
- Preserve `frontend/legacy.html` parity for replicated surfaces.
- For quote save behavior, preserve save-time quote number allocation. Do not pre-generate quote numbers on an unsaved Builder screen.

### Backend

- Keep dependency direction: HTTP handler -> application service -> repository interface -> Postgres/sqlc.
- Put use-case orchestration in service code, not handlers.
- Keep transactions in repository adapters.
- Do not edit existing migration files; add a new migration.
- Do not expose secrets in logs or responses.

### CI/CD And Infra

- `.github/workflows/ci.yml` runs frontend, backend, and Docker package checks.
- `.github/workflows/deploy-staging.yml` deploys `staging`.
- `.github/workflows/deploy-prod.yml` deploys `main`.
- `infra/scripts/phase-a-verify.sh --check-http` verifies GCP/IAP/DNS/Cloud Run readiness.
- Changes under `.github/workflows/`, `infra/`, Cloud SQL, Secret Manager, or IAP are high risk and should request owner review even if the PR can be self-merged.

## Required Verification

Pick checks based on the touched area:

- Frontend code: `cd frontend && pnpm run typecheck && pnpm run lint && pnpm test -- --runInBand && pnpm run build`
- Backend code: `cd backend && golangci-lint run && go vet ./... && go test ./...`
- Workflow/scripts: `bash -n infra/scripts/*.sh`, YAML parse, `actionlint`
- Runtime deploy: GitHub Actions run URL and conclusion
- Staging/prod smoke: browser or `curl` evidence

If login is required and the AI cannot authenticate, mark the browser flow as `Blocked` and ask the user to log in.

## Response Format

Report in Traditional Chinese. Keep it short, but include evidence:

- `已完成`: what changed
- `驗證`: commands/workflows/browser flows and results
- `未覆蓋`: exact gaps
- `下一步`: merge/deploy/smoke step

Do not claim a workflow is complete without current evidence.

