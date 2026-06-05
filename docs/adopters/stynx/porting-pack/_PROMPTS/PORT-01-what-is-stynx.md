# PORT-01 — What Is STYNX

**Produces:** `docs/stynx/porting-pack/01-WHAT-IS-STYNX.md`.
**Depends on:** `_DISCOVERY.md`, `04-INVARIANTS-AND-CONTRACTS.md`,
`05-PACKAGE-CATALOG.md`.
**Branch:** `docs/stynx/porting-pack/01-what-is-stynx`.

## Mission

Self-contained explanation for an agent that has never seen STYNX.
After reading, the agent should be able to describe STYNX accurately
to a third party.

## Structure

```
# 01 — What is STYNX

## Elevator pitch

[200–300 words. Drawn from STYNX-SPEC-v0.6.md §0–§1. What problem
does STYNX solve, what choices does it make, what does it
deliberately not do.]

## Capability matrix

| Capability | Description | Spec § |
|---|---|---|
| Multi-tenancy (pool + RLS) | … | §4 |
| Identity (Cognito as IdP) | … | §5 |
| RBAC permissions | … | §6 |
| Audit trail | … | §9 |
| Soft delete via archive | … | §14 |
| Storage (S3 + presigned) | … | §13 |
| LGPD pipeline | … | §9 |
| Logging + redaction | … | §11 |
| Health + metrics + tracing | … | §11 |
| Rate limiting | … | §15 |
| Idempotency | … | §22 |
| i18n (pt-BR + en-US) | … | §23 |

## Tech stack at a glance

- Backend: NestJS, TypeScript (strict), Drizzle ORM.
- Frontend: Angular, RxJS.
- Database: PostgreSQL (RLS-on).
- Cache: Redis.
- Identity: AWS Cognito (User Pool only; no Cognito Groups for tenancy).
- Object storage: S3 + KMS CMKs.
- Compute: ECS Fargate (per CDK skeleton).
- Observability: Pino → CloudWatch, OTel → APS, Prometheus → Grafana.

## Architectural style — non-negotiables

- Pool + RLS multi-tenancy (no schema-per-tenant, no DB-per-tenant).
- RBAC, not ABAC.
- Cognito as IdP only (tenancy + roles live in STYNX DB).
- Archive-schema soft delete (no `deleted_at` on live tables).
- DB-trigger audit (not application-layer logging).
- AWS-only.
- Web/Angular only (no native mobile shell in v1.0).

## What STYNX is NOT

- Not an event bus.
- Not a job runner.
- Not a webhook system.
- Not a feature-flag service.
- Not a tenant self-signup system.
- Not an API-key / M2M issuer.
- Not a relationship-based authz system.

(All v1.1+ deferrals per spec §24.)
```

## Rules

- The capability matrix maps to the package catalog (PORT-05). Do
  not list a capability that has no corresponding package.
- The tech-stack list cites at least one `package.json` per claim
  (e.g. NestJS version from `packages/core/package.json`).
- The "what STYNX is not" list comes from spec §24 — verify before
  writing.

## Acceptance

- Word count 600–1000 (focus matters more than coverage).
- Every claim cites a spec section or file path.
- No mention of features marked NOT YET IMPLEMENTED in PORT-05.
