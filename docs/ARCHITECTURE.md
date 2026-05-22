# ARTWAY Quote System Architecture

This document describes the current implementation boundaries for the ARTWAY
quote system. It is intentionally factual: the codebase is moving toward Clean
Architecture, but it is not a strict multi-package Clean Architecture layout yet.

## Runtime Shape

Local and deployed environments run the same core application:

- Frontend: Vite + React + TypeScript, built into static assets.
- Backend: Go + chi HTTP server.
- Database: PostgreSQL, accessed through pgx and sqlc-generated query code.
- Production target: Cloud Run service with Cloud SQL Postgres and GCP IAP.

The intended production package is a single Cloud Run service that serves the
API and the built frontend. Local development can run frontend and backend
separately.

## Backend Layers

Backend code is organized by bounded feature under `backend/internal`. The
`quotes` feature currently has these roles:

- `cmd/server`: composition root. It loads config, opens the database pool,
  wires repositories and handlers, and mounts routes.
- `internal/auth`: authentication context and IAP/dev-user extraction.
- `internal/config`: environment and application configuration.
- `internal/db`: database pool setup and migrations.
- `internal/health`: liveness and readiness endpoints.
- `internal/quotes/handler.go`: HTTP adapter. It decodes requests, validates
  transport-level fields, maps auth context into params, and writes HTTP
  responses.
- `internal/quotes/service.go`: application layer. It owns use-case flow that
  should not live in HTTP handlers, and depends on narrow use-case ports such as
  `CreateQuoteRepository` rather than the full repository surface.
- `internal/quotes/repo.go`: repository port plus the current PostgreSQL
  adapter. It translates Go-native params into sqlc params, owns transactions,
  and maps pgx/sqlc errors into package-level errors.
- `internal/quotes/queries.sql` and `internal/quotes/sqlcgen`: SQL source and
  generated database access code.

The package currently keeps service, port, and adapter in one Go package. That
is acceptable for the current size, but the dependency direction must still be:

```text
HTTP handler -> application service -> repository interface -> Postgres/sqlc
```

Handlers should not call sqlc, pgx, or transaction APIs directly. Application
services should not know HTTP response formats. Repository implementations should
not know about frontend form state or browser behavior.

## Quote Creation Use Case

Quote number allocation follows the save-time Option B rule:

- A new unsaved Builder screen has no quote number.
- Refreshing an unsaved quote must not burn a quote serial.
- The quote number is allocated only when a quote is created.
- Allocation and quote insertion must be one transactional repository operation.

The current code enforces this through `quotes.Service.CreateQuote`:

- If `CreateParams.QuoteNo` is already present, the service calls
  `Repository.Create`.
- If `CreateParams.QuoteNo` is empty, the service calls
  `Repository.CreateWithAllocatedNumber`.
- The PostgreSQL repository implementation starts a transaction, increments
  `quote_serials`, writes the quote row, then commits.

This keeps the business decision out of the HTTP handler and keeps the atomic
database boundary inside the repository adapter.

## Frontend Boundaries

Frontend code is currently a practical React architecture, not Clean
Architecture. The main boundaries are:

- `frontend/src/lib`: quote calculation, state helpers, and save/load hooks.
- `frontend/src/api`: HTTP API adapters and persistence mapping.
- `frontend/src/components`: reusable UI components.
- Feature views and modules hold screen-specific behavior and styling.

The next frontend architecture step is to separate quote domain/application logic
from HTTP adapter details:

- Keep pure calculation and normalization in `lib` or a dedicated domain folder.
- Move save/load orchestration into application-level hooks or services.
- Keep `src/api` focused on request/response transport mapping only.
- Keep React components responsible for rendering and user interaction, not API
  payload construction.

## Data Rules

- Existing migrations under `backend/migrations` must not be edited. Add a new
  migration for schema changes.
- `quotes.body` stores the frontend quote payload as JSONB. Backend list views
  use indexed metadata columns; the body is treated as a black box unless a new
  backend requirement says otherwise.
- `quote_no` is a permanent identifier and must not change on update.
- Soft-deleted quotes remain in the database and are excluded from normal read
  paths.

## Verification Expectations

Architecture changes should be verified at the layer they affect:

- Application service changes: focused unit tests for service behavior.
- Repository transaction changes: repository tests or integration evidence
  against PostgreSQL when behavior depends on commit/rollback semantics.
- Handler changes: HTTP handler tests and, when relevant, `curl` or browser
  evidence against the running app.
- Frontend persistence changes: unit tests around hooks/API mapping plus browser
  evidence for user-visible flows.

Before declaring an architecture change complete, the report must state which
layers were verified and which parts remain outside the current scope.
