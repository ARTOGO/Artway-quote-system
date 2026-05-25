---
name: artway-quote-self-serve
description: Use when developing ARTWAY quote-system changes for non-engineers, including coding conventions, architecture boundaries, CI/CD, staging, production release, and verification requirements.
---

# ARTWAY Quote Self-Serve Skill

Before editing, read:

1. `CLAUDE.md`
2. `docs/SELF_SERVE_DEVELOPMENT.md`
3. `docs/AI_DEVELOPMENT_SKILL.md`
4. `docs/ARCHITECTURE.md`
5. `progress.json`

Follow `docs/AI_DEVELOPMENT_SKILL.md` as the canonical execution workflow.

Key guardrails:

- Work on a feature branch; never direct-push `main` or `staging`.
- Merge to `staging` first, verify staging, then merge `staging` to `main`.
- Keep PR + CI as the deploy gate.
- Preserve save-time quote number allocation.
- Use `frontend/src/styles/tokens.scss` for UI values.
- Use Radix for interactive components.
- Do not edit existing migrations or commit secrets.
- Report verified, not covered, and blocked items separately in Traditional Chinese.

