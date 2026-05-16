# stynx Agent Guide

> **Phase G of the C-4 DEVAI adoption pilot (2026-05).** This file used to define Codex-style approval modes for autonomous agents in stynx. Per session directive 5.2 (DEVAI is authoritative; supersedes legacy stynx governance), agent discipline now defers to DEVAI.

This file is the [`agents.md`](https://agents.md) protocol surface. AI sessions operating on stynx should:

1. **Read [`../devai/CLAUDE.md`](../devai/CLAUDE.md) first** — propose-before-producing, cite-the-constitution, validate-before-declaring-done. The discipline applies in stynx as fully as in devai itself (Article 36 self-application, applied transitively to adopters).
2. **Read [`../devai/CONSTITUTION.md`](../devai/CONSTITUTION.md), Article 6** — the five human roles (Owner, Architect, Engineer, Inspector, Auditor) and their substrate authority by path. **Declare your role in every commit subject** (e.g., `Architect: ...`); the merged commitlint config (`tools/repo-config/commitlint.config.cjs`) accepts both role-prefix and Conventional Commits shapes.
3. **Read [`GOVERNANCE.md`](GOVERNANCE.md)** — the canonical pointer to stynx's DEVAI-shaped governance surfaces.
4. **Read [`docs/devai-phase-a-retro.md`](docs/devai-phase-a-retro.md) and the C-4 pilot brief at `../devai-adoption-by-stynx.md`** — context for how stynx adopts DEVAI and which gaps (D-A-1 … D-A-8) are filed for follow-up devai sessions.

## Stynx-specific operational notes (NOT superseded by DEVAI)

These are stynx-side conventions DEVAI doesn't speak to; they remain authoritative.

### Directory responsibilities

- `apps/reference-{api,web}/` — reference applications (NestJS API + Angular web) that demonstrate stynx framework usage. Per directive 5.4, the canonical naming target is `reference/{api,web}/`; the relocation is deferred to a future Engineer session (see Phase A retro §3).
- `packages/*` (16 packages, `@stynx/*`) — backend reusable modules (NestJS-shaped: audit, auth, backend, contracts, core, data, health, i18n, idempotency, logging, privacy, ratelimit, sessions, storage, tenancy, testing).
- `packages-web/*` (10 packages, `@stynx-web/*`) — Angular reusable modules (sdk, angular, angular-auth, angular-i18n, angular-profile, angular-sessions, angular-storage, angular-tenancy, angular-trash, angular-ui).
- `tools/*` — internal repo tooling (`@stynx-internal/*`).
- `domain/*` — DEVAI-scaffolded modules (Phase D output and onward).
- `infra/cdk/` — AWS CDK infrastructure.
- `db/ddl/` — canonical SQL definitions; update seeds + tests in `test/db/` when DDL changes.
- `legacy: backend/, frontend/, bootstrap/, test/` — preserved during framework extraction; outside the active workspace graph.

### Stynx-specific rules

1. Mirror existing naming, module boundaries, and linting conventions.
2. **Enforce RLS and tenancy** in every new table or API surface (see `INV-RBAC-001` and the tenancy module).
3. Update seeds + DDL tests alongside schema changes.
4. Prefer path aliases (`@core`, `@shared`, `@admin`, `@storage`, `@env`) over deep relative imports.
5. Do not delete or bypass generated scripts — they are referenced by CI/CD.
6. When in doubt about release state, study `docs/stynx/release-readiness.md`, `docs/stynx/implementation-status.md`, and recent `git log`.

### Idiosyncratic stynx skills (kept post-Phase G)

- `.codex/skills/npm-security-upgrade-auditor/` — dependency security audit. No DEVAI equivalent; **kept** per Phase A retro §6.

### Retired stynx skills

- `.codex/skills/governance-structure-auditor/` — superseded by DEVAI's `SKILL-compute-scorecard` + `SKILL-assess-state` + `SKILL-compile-backlog` triplet. Archived under `.codex/legacy/` (Phase G).
- `.codex/skills/repo-governance-aligner/` — superseded by `devai init --execute` and DEVAI's substrate scaffolding. Archived under `.codex/legacy/` (Phase G).

## Approval modes (relegated)

The pre-pilot Codex-style approval modes (`danger-full-access`, `workspace-write`, `read-only`, `approval_policy: never`) are **no longer the framing for agent authority in stynx.** DEVAI's five-role authority model takes precedence. The Codex modes are still respected by the `.codex/` runtime when sessions are launched there, but cross-session agent discipline (commit-subject role declaration, substrate authority, evidence chain) follows DEVAI.
