# AGENTS.md

This repository's collaboration guidelines for **all AI agents** (Claude Code, Cursor, Copilot, Codex, etc.) live in **[CLAUDE.md](./CLAUDE.md)**.

Read that file before touching anything in this repo.

Key points (full version in CLAUDE.md):

- **Stack**: Vite + React + TypeScript + Radix UI + Module SCSS (frontend) / Go + chi + pgx + sqlc (backend) / Cloud Run + Cloud SQL Postgres / GCP IAP for Workspace SSO
- **Branches**: `main` → prod (protected, PR required), `staging` → staging
- **Design system**: tokens at `frontend/src/styles/tokens.scss`; do NOT use Tailwind or magic numbers
- **Forbidden**: direct push to main, editing existing migrations, committing secrets, using inline styles
- **Required**: typecheck + lint + test must pass before commit; `/codex:review` before commit per global CLAUDE.md rule
