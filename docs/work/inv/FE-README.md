# Frontend Completeness Inventory — stynx

**Compiled:** 2026-05-19
**Author role (Article 6):** Engineer (per user assignment) — read-only inventory of the `packages-web/*` surface and what it offers consuming client applications.
**Scope:** Compare what `packages-web/*` (the `@stynx-web/*` library suite) actually ships against the expectations enumerated by the user — Authentication / Login, Profile, Sessions, Users / Roles / Groups management, Permissions handling, full i18n from app bootstrap, Storage primitives (upload / download / trash), full Tenancy support, common Audit report components, and an installable full-featured Workflow UI on top of `@stynx/flow`.
**Out of scope:** Backend test surfaces, DB DDL, mutation thresholds, perf — covered by the pre-existing `docs/work/inv/01-matrix.md` … `07-cross-cutting.md` testing-pipeline audit. This pass focuses on **what consuming client apps actually get** from the frontend library set, and where the testing of that surface stands.
**Naming:** Every file in this pass is prefixed `FE-` so the testing-pipeline audit (already on disk in this directory) is undisturbed.

## Files in this directory (this audit)

| File                                                                       | Purpose                                                                                                                |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [FE-README.md](FE-README.md)                                               | This overview.                                                                                                         |
| [FE-LIFTUP-current-inventory.md](FE-LIFTUP-current-inventory.md)           | Post-interruption live inventory for the FE lift-up recovery session.                                                   |
| [FE-01-expectations-matrix.md](FE-01-expectations-matrix.md)               | One-row-per-expectation status matrix: present / partial / stub / missing, with the package + file evidence.            |
| [FE-02-package-inventory.md](FE-02-package-inventory.md)                   | Per-package shape: exports, standalone-ness, signal vs RxJS, public surface, peer deps, ng-package readiness, stubs.    |
| [FE-03-admin-and-rbac-surfaces.md](FE-03-admin-and-rbac-surfaces.md)       | Special focus: what admin UIs exist for user lifecycle, role/group associations, grants. Where IAM management lives, or doesn't. |
| [FE-04-flow-ui-inventory.md](FE-04-flow-ui-inventory.md)                   | `@stynx-web/angular-flow` deep-dive: designer / canvas / forms / fills / waivers / analytics / routes / install path.   |
| [FE-05-cross-cutting-standards.md](FE-05-cross-cutting-standards.md)       | Modern Angular standards check: standalone, signals on UI, RxJS in services, change detection, OnPush, DI, peer-deps. |
| [FE-06-test-surface-vs-completeness.md](FE-06-test-surface-vs-completeness.md) | Current frontend test surface, narrowed to "does it actually exercise the completeness claims above?". Complements `inv/03-frontend.md`, does not replace it. |

## Pre-existing artifacts on disk (NOT touched by this pass)

The following testing-pipeline audit is already in this directory and remains canonical for its own scope:

- [01-matrix.md](01-matrix.md) — full per-package test-matrix.
- [02-runners.md](02-runners.md) — frameworks, runners, fixtures.
- [03-frontend.md](03-frontend.md) — web-package test surface (numbers).
- [04-backend.md](04-backend.md) — backend test surface.
- [05-db.md](05-db.md) — DDL / RLS test surface.
- [06-mutation.md](06-mutation.md) — Stryker coverage.
- [07-cross-cutting.md](07-cross-cutting.md) — aggregators, evidence, CI hooks.

This pass adds the `FE-*` files only.

## What "complete" means here

Per the assignment, the frontend library suite must let a client developer **install a small number of `@stynx-web/*` packages and immediately have**:

1. **Auth** — full Login (OIDC + STYNX session exchange), session refresh, logout, permission-aware UI.
2. **Profile** — view + edit own profile, preferences, password / MFA controls.
3. **Sessions** — see active sessions, revoke one, revoke all others.
4. **Users / Roles / Groups management** — admin UIs to create / disable / edit users, assign roles, manage groups, see memberships.
5. **Permissions handling** — admin UIs to view / grant / revoke permissions per role and per group; component-level `*hasPermission` directive and guard.
6. **Full i18n from start** — every shipped component renders translated strings out of the box; locale switcher; runtime catalog loading; pluralisation; date/number locale formatting.
7. **Storage primitives** — `<input type="file">` upload to presigned URLs, multipart, progress UI, download, soft-delete to trash, restore, hard-delete.
8. **Full Tenancy support** — current tenant context, tenant switcher, header injection on every outgoing request, state reset on tenant change.
9. **Common audit report components** — read-only viewers for the audit log (cursor pagination, filtering, hash-chain integrity indicator), per-entity history viewer.
10. **Installable Workflow UI** — host app calls `provideStynxFlow()` + `flowRoutes()` and immediately has the full design + run + monitor surface for `@stynx/flow` workflows.

Each must be **lean, modern Angular** (Angular ≥ 20, standalone, signals on the UI layer, RxJS on the service / HTTP layer, `OnPush`, typed forms, typed routes), **i18n-ready from day one**, and **carefully separated** (auth doesn't depend on flow, profile doesn't depend on storage, etc.).

[FE-01-expectations-matrix.md](FE-01-expectations-matrix.md) maps each row of that list to the current state.

## Topline state (preview — full table is in FE-01)

| Expectation                          | Current state                                                                              | Verdict       |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ------------- |
| Auth — Login / refresh / logout      | `angular-auth` full (Cognito OIDC + session exchange + guard + directive)                  | **OK**        |
| Profile — view/edit/prefs/MFA        | `angular-profile` ships only 2 bare form components (no service, no validation, no MFA)   | **STUB**      |
| Sessions — list / revoke (self)      | `angular-sessions` ships 1 component + adapter contract; no embedded backend integration   | **PARTIAL**   |
| Users / Roles / Groups admin         | **No package** — no `@stynx-web/angular-iam` or `angular-admin`; no list/create/edit UI    | **MISSING**   |
| Permissions admin UI                 | Component-level guard / directive exist; **no admin UI** to manage role-perm / group-perm  | **MISSING**   |
| i18n from start                      | Runtime catalog + locale switcher in `angular-i18n`; **no translation files**, no extract  | **PARTIAL**   |
| Storage — upload / download / trash  | `angular-storage` upload OK; download path under-shipped; trash is a separate adapter pkg  | **PARTIAL**   |
| Tenancy — context / switcher / DI    | `angular-tenancy` full (signal-based context, interceptor, switcher, provider)              | **OK**        |
| Audit report components              | **No package** — no audit-log viewer, no per-entity history component                       | **MISSING**   |
| Workflow UI on `@stynx/flow`         | `angular-flow` ships designer / canvas (list) / forms / fills / waivers / analytics / routes | **OK (v0.1)** |

Four expectations are met; three are partial; **three are missing entirely** (IAM admin, audit viewer, real i18n catalogs). Detail and evidence in the per-topic files.

## Method

- Filesystem inspection of `/Users/aarusso/Development/stech/stynx/packages-web/*` (source + `package.json` + `vitest.config.ts` + `test/`).
- `/Users/aarusso/Development/stech/stynx/coverage/test-evidence.json` (snapshot 2026-05-19T03:41:15Z) for test counts and coverage.
- Cross-reference with the existing testing-pipeline audit (`inv/03-frontend.md`, `diag/06-frontend-quality.md`) to avoid duplicating their numbers.
- No code was executed; assertions reference the most recent canonical run as of the compile date.

## What this pass does **not** assert

- Backend completeness (covered by `inv/04-backend.md`).
- Whether the backend exposes the right endpoints for the missing FE surfaces (the IAM admin UI is missing on the FE, but `packages/iam` etc. on the backend are a separate audit).
- Network / build / publish pipeline for the libraries (touched only in [FE-02](FE-02-package-inventory.md) at the `ng-package.json` level).
