---
title: Start here
sidebar_label: Start here
slug: /
---

# STYNX

A multi-tenant document and work-item management platform — a [DEVAI](https://aarusso-nyx.github.io/devai/)-managed library at maturity. Constitution pin: **0.2.0** (R15, 2026-06-05).

**Audiences:**

- **Integrators** building on `@stynx-nyx/*` and `@stynx-web/*`: head to [Framework](/docs/framework/) for the contract surface, then [Adopters → STYNX adoption pack](/docs/adopters/stynx/) for the AI-agent porting reference.
- **Architects** operating in this repo: read `AGENTS.md` + `CLAUDE.md`, then [`framework/arch/`](/docs/framework/arch/) and the locked decisions in [`meta/adr/`](/docs/meta/adr/).
- **DEVAI adopters** evaluating STYNX as a reference: see the C-4 pilot retros under [`adopters/pilots/c-4/`](/docs/adopters/pilots/c-4/) and the migration ADR at [`meta/adr/ADR-DEVAI-0.2.0-MIGRATION`](/docs/meta/adr/ADR-DEVAI-0.2.0-MIGRATION).

## Purpose

Stynx is a multi-tenant document and work-item management platform (inferred) built as a pnpm monorepo. It exposes a NestJS REST API backed by PostgreSQL, consumed by an Angular front-end. Core business objects are documents, records, record notes, and work items.

## Stack at a glance

| Layer            | Technology                                    |
| ---------------- | --------------------------------------------- |
| API              | NestJS                                        |
| Frontend         | Angular                                       |
| Database         | PostgreSQL                                    |
| Package manager  | pnpm                                          |
| Primary language | TypeScript (494 files), JavaScript (99 files) |

Source roots: `packages/*/src`, `packages-web/*/src`, `reference/{api,web}/src`, `domain/*`.

## Surface

| Surface                 | Count                      |
| ----------------------- | -------------------------- |
| REST endpoints          | 50                         |
| Frontend routes         | 15 Angular routes detected |
| DB tables               | 5                          |
| DB columns              | 61                         |
| PII columns             | 1                          |
| Dep-graph nodes / edges | 484 / 1,989                |

**Controllers and their prefixes:**

- `ReferenceProbesController` — operational probes under `/_probes/` (data-tx, idempotency, ratelimit, readonly-write)
- `ReferenceDevAuthController` — dev-only auth helpers under `/_reference/` (auth-verify, demo-tenants, dev-login)
- `DocumentsController` — document lifecycle (create, download, soft-delete, hard-delete, restore, complete) under `/documents`
- `RecordNotesController` — full CRUD + soft-delete/restore under `/record-notes`

**Tables:** `record`, `record_note`, `work_item`, `work_item_entry`, `work_item_lock`

## Notable gaps

- **Reference app RBAC is authored outside the current sensor body** — the durable source is [Reference App RBAC Inventory](../framework/arch/reference-app-rbac.md), because current DEVAI `sense-rbac` still emits empty route bindings.
- **Operations and infra gaps remain** — see [Known Gaps](/docs/meta/known-gaps) for the current open runbook, EdgeStack, Docker healthcheck, and local Cognito gaps.
- **Frontend/package test depth remains uneven** — the reference app is now visible to route/use-case coverage, but package-level frontend coverage still needs a broader audit.

## Where to look next

- `DocumentsController` (`/documents`) — core lifecycle logic; start here for the primary business flow.
- `record.email` — PII column registered in `core.pii_map` with legal basis and retention.
- `/_reference/dev-login` (`ReferenceDevAuthController`) — non-production reference auth convenience; `SampleModule` omits it when `NODE_ENV` or `STYNX_ENVIRONMENT` is production/prod.
- `/_probes/*` (`ReferenceProbesController`) — idempotency, rate-limit, and read/write health signals; review before infrastructure changes.
- `work_item*` tables — reference work-item APIs are present under `/work-items`, `/work-item-entries`, and `/work-item-locks`.
