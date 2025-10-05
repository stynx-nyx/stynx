# st-core Agent Guide

This repository consolidates reusable scaffolding from the PORM and PEC systems. Follow these guidelines while extending the platform.

## Directory Responsibilities
- `backend/` – NestJS codebase. Core modules live under `src/core`. Do not introduce domain-specific logic here; build reusable services and guards only.
- `frontend/` – Angular base app. Keep shared widgets in `shared/`, Cognito/auth logic under `core/auth`, and feature entrypoints in `admin/` and `storage/`.
- `db/ddl` – Canonical SQL definitions (auth, audit, storage). Update seeds and accompanying tests under `test/db` when DDL changes.
- `scripts/` – Automation scripts. They must remain idempotent, shellcheck-friendly, and macOS/Linux compatible.
- `docs/` – Documentation split into `sys` (architecture), `dev` (coding standards), and `api` (generated specs). Keep diagrams and tables in Markdown or PlantUML.
- `test/` – Centralised test harness. Add backend specs to `test/backend`, frontend unit/E2E to `test/frontend`, and script validations to `test/scripts`.

## General Rules
1. Mirror naming, module boundaries, and linting conventions set by the PORM repository.
2. Enforce RLS and tenancy checks in every new table or API surface.
3. Update documentation and seeds alongside code changes; nothing should be undocumented.
4. Prefer path aliases (`@core`, `@shared`, `@admin`, `@storage`, `@env`) over deep relative imports.
5. Do not delete or bypass the generated scripts—they are referenced by CI/CD stubs.
6. When in doubt, study `SUMMARY.md` for what was merged from PORM/PEC and coordinate with maintainers via TODOs in `TODO.md`.
