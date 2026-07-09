# STYNX Boundary

This document lists platform responsibilities that STYNX owns for adopter
repos. Adopters keep domain law, state transitions, evidence meaning, and
provider-specific schemas.

## Shared Package Boundary

| Package                      | STYNX responsibility                                                                                          | Adopter responsibility                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@stynx-nyx/signature`           | PAdES/TSA/OCSP/CRL facade, signature evidence contract, provider interface.                                   | Domain signing policy, certificate provider credentials, legal retention, and audit event meaning. |
| `@stynx-nyx/pdf`                 | Server-side PDF render facade, template/render result contract, signature digest handoff, PDF/A adapter hook. | Domain templates, branding assets, data selection, legal text approval, and validation policy.     |
| `@stynx-nyx/pdf-a`               | PDF/A validator interface, result contract, stubs, and telemetry metric names.                                | Choosing where validation is required and how failures affect each workflow.                       |
| `@stynx-nyx/pdf-a-vera-docker`   | Reference veraPDF Docker adapter, digest-pinned image default, report normalization, fixture corpus, bench.   | Docker runtime availability, image override policy, and high-volume validation caching.            |
| `@stynx-nyx/feature-flags`       | Tenant/environment/global flag evaluation contract and provider interface.                                    | Deciding which domain behaviors may be flag-gated and auditing material decisions.                 |
| `@stynx-nyx/integration-adapter` | Retry, timeout, idempotency, circuit breaker, and telemetry pattern for external calls.                       | Provider schemas, homologation evidence, credential handling, and domain error semantics.          |

## Rule

If a concern is generic platform behavior, prefer STYNX. If it changes legal
meaning, workflow state, evidence custody, numbering, domain interpretation, or
provider-specific schema semantics, keep it in the adopter repo.

PDF/A validation is now an in-scope STYNX surface through `@stynx-nyx/pdf-a` and
`@stynx-nyx/pdf-a-vera-docker`. R10 documented it as excluded; R12 supersedes that
boundary for validation only.

## RBAC Watch

R10 opened an RBAC stability watch at
[`docs/work/2026-05-24-rbac-stability-watch.md`](../../work/2026-05-24-rbac-stability-watch.md).
Transient adopter-side RBAC failures should not trigger STYNX code changes until
they reproduce twice with role, tenant, route, status-code, and stack evidence.

## Shared Verifiers

STYNX owns these adopter-facing verifiers:

| Script                             | Purpose                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `scripts/verify-stynx-boundary.ts` | Checks configured STYNX package seams and forbidden platform imports.                      |
| `scripts/verify-api-coverage.mjs`  | Compares OpenAPI paths with implemented NestJS controller paths.                           |
| `scripts/verify-db-acceptance.mjs` | Checks configured DDL/seed shape, required schemas, required tables, and RLS declarations. |

## DEVAI-Owned Test Evidence Commands

STYNX does not keep local compatibility wrappers for DEVAI-owned test evidence
commands. Workspace scripts invoke DEVAI directly:

| Task              | DEVAI CLI                  |
| ----------------- | -------------------------- |
| Matrix rendering  | `devai render-matrix`      |
| Run recording     | `devai record-run`         |
| Evidence emission | `devai evidence-emit`      |
| Coverage merge    | `devai coverage-aggregate` |
