# stynx Agent Guide

This file is the `agents.md` protocol surface (https://agents.md). For repo-specific agent configuration, see `.codex/`.

This repository bundles the reusable scaffolding extracted from previous production apps. Follow these guidelines while extending the platform.

## Directory Responsibilities

- `backend/` – NestJS codebase. Core modules live under `src/core`. Do not introduce domain-specific logic here; build reusable services and guards only.
- `frontend/` – Angular base app. Keep shared widgets in `shared/`, Cognito/auth logic under `core/auth`, and feature entrypoints in `admin/` and `storage/`.
- `db/ddl` – Canonical SQL definitions (auth, audit, storage). Update seeds and accompanying tests under `test/db` when DDL changes.
- `scripts/` – Automation scripts. They must remain idempotent, shellcheck-friendly, and macOS/Linux compatible.
- `docs/` – Documentation split into `sys` (architecture), `dev` (coding standards), and `api` (generated specs). Keep diagrams and tables in Markdown or PlantUML.
- `test/` – Centralised test harness. Add backend specs to `test/backend`, frontend unit/E2E to `test/frontend`, and script validations to `test/scripts`.

## General Rules

1. Mirror the established naming, module boundaries, and linting conventions already present in the repo.
2. Enforce RLS and tenancy checks in every new table or API surface.
3. Update documentation and seeds alongside code changes; nothing should be undocumented.
4. Prefer path aliases (`@core`, `@shared`, `@admin`, `@storage`, `@env`) over deep relative imports.
5. Do not delete or bypass the generated scripts—they are referenced by CI/CD automation.
6. When in doubt, study `SUMMARY.md` for the latest merge notes and coordinate unfinished work through `TODO.md`.

## Mode Guidelines

- **danger-full-access** – Treat commands as operating on the developer’s live filesystem. Avoid destructive operations, double-check paths, and never reset user changes.
- **workspace-write** – You may write only inside the workspace; request guidance before touching external paths.
- **read-only** – Limit yourself to analysis and documentation; stage proposed changes separately.
- **approval_policy: never** – You must succeed without escalation. Prefer deterministic scripts, avoid risky shell commands, and provide manual follow-up steps if a task truly requires elevated access.
- **approval_policy: on-request / on-failure** – Attempt tasks in the sandbox first, then surface any required escalations with clear justification.
