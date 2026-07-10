# 05 — Package Catalog

For every `@stynx-nyx/*` and `@stynx-nyx/*` package found in discovery,
this catalog states the public surface and when a consuming agent
should reach for it. Surfaces are pulled from each package's
`src/index.ts` at HEAD (`670d165`).

> **Spec drift to know:** spec §3 lists 16 backend packages. The repo
> ships **17** — `@stynx-nyx/backend` (44 exports) is an undocumented
> composition module the reference-api imports for
> `StynxPlatformPipelineModule`, `AuditInterceptor`, and
> `STYNX_AUDIT_SINK`
> (`reference/api/src/app.module.ts:11`). Treat it as STABLE.

---

## Backend (`packages/`)

### `@stynx-nyx/core` — v0.1.0

- **Purpose:** RequestContext, error filter, base Database
  abstraction, secret loading.
- **Maturity:** STABLE (5 tests, README).
- **Public surface:**
  - `StynxCoreModule` — root NestJS module.
  - `Database` (re-exported by `@stynx-nyx/data` as the platform base).
  - `RequestContext`, `RequestContextInterceptor`.
  - `SystemContext`, `withSystemContext` (re-exported by `@stynx-nyx/data`).
  - `StynxErrorFilter` (global exception filter).
  - `requestId` helper.
  - Config + secret loaders, error classes, tokens.
- **Peer deps:** `@nestjs/common`, `@nestjs/core`, `reflect-metadata`,
  `rxjs`, `nestjs-cls`.
- **Import when:** every consuming app — this is the foundation.
- **Citation:** `packages/core/src/index.ts`.

### `@stynx-nyx/data` — v0.1.0

- **Purpose:** DB access, transactions, soft-delete,
  RO mode, archive helpers.
- **Maturity:** STABLE (6 tests, README, contract coverage 100 %).
- **Public surface:** see [`16-SPEC-EXCERPTS/data-api-contract.md`](16-SPEC-EXCERPTS/data-api-contract.md).
  Highlights: `StynxDataModule`, `Database`, `Transaction`,
  `withSystemContext`, all 13 error classes, `withDeleted` /
  `onlyDeleted`, `StynxPoolRegistry`.
- **Peer deps:** `@nestjs/common`, `pg`, `drizzle-orm`, `nestjs-cls`.
- **Import when:** any DB access. Always.
- **Citation:** `packages/data/src/index.ts`.

### `@stynx-nyx/auth` — v0.1.0

- **Purpose:** Cognito JWT verification, permission cache (ADR-002),
  decorators (`@Permission`, `@ReadOnly`, `@Public`, `@System`),
  `StynxAuthGuard`, `PermissionGuard`.
- **Maturity:** STABLE (12 tests, largest backend test count).
- **Public surface (20 exports):**
  - Decorators: `@Permission`, `@ReadOnly`, `@Public`, `@System`.
  - Guards: `StynxAuthGuard`, `PermissionGuard`.
  - Modules/Services: `StynxAuthModule`, `AuthService`,
    `AuthController`, `PermissionQueryService`.
  - Validators: `CognitoJwtValidator`, `StynxJwtValidator`,
    `CognitoTokenVerifier`.
  - Cache: `PermissionCache`, `InMemoryPermissionCacheBackend`,
    `RedisPermissionCacheBackend`, `EffectiveHashComputer`,
    `PermissionCacheMetrics`.
  - Cognito admin: `CognitoAdminAdapter`.
  - `ActorContextInterceptor`, `Doctor`, tokens, types.
- **Peer deps:** `@nestjs/common`, `@aws-sdk/client-cognito-identity-provider`,
  `@aws-sdk/credential-providers`, `jose` (or jsonwebtoken).
- **Import when:** any HTTP-fronted app, always.
- **Citation:** `packages/auth/src/index.ts`.

### `@stynx-nyx/tenancy` — v0.1.0

- **Purpose:** TenantContext interceptor, tenancy module, membership
  cache.
- **Maturity:** STABLE (4 tests, README).
- **Public surface (10):** `StynxTenancyModule`,
  `TenantContextInterceptor`, `TenancyService`, `TenancyController`,
  `TenancyPlatformAdminGuard`, `MembershipCache`,
  `TenantSystemOperationSink`, tokens, types, utils.
- **Peer deps:** `@nestjs/common`, `@stynx-nyx/data`, `nestjs-cls`.
- **Import when:** any multi-tenant app.
- **Citation:** `packages/tenancy/src/index.ts`.

### `@stynx-nyx/sessions` — v0.1.0

- **Purpose:** Session token issuance + refresh, JWKS endpoint,
  Redis hot store + DB durable mirror.
- **Maturity:** STABLE.
- **Public surface (10):** `StynxSessionsModule`, `SessionService`,
  `JwksController`, `JwtSigningService`, `RedisSessionStore`,
  `InMemorySessionStore`, `SessionMirrorWriter`, errors, tokens, types.
- **Peer deps:** `@nestjs/common`, `ioredis`.
- **Import when:** any app issuing STYNX bearer tokens.
- **Citation:** `packages/sessions/src/index.ts`.

### `@stynx-nyx/audit` — v0.1.0

- **Purpose:** Audit-log read API, retention helpers, SQL adapter,
  hash-chain verification entry points.
- **Maturity:** STABLE (3 tests, README).
- **Public surface (8):** `StynxAuditModule`, `AuditService`,
  `AuditController`, retention helpers, `AuditSqlSink`/`SqlAdapter`,
  test helpers, tokens, types.
- **Peer deps:** `@nestjs/common`, `@stynx-nyx/data`.
- **Import when:** any app exposing audit-log read APIs.
- **Citation:** `packages/audit/src/index.ts`.

### `@stynx-nyx/storage` — v0.1.0

- **Purpose:** S3 access, document registry, presigned URLs, KMS
  envelope encryption.
- **Maturity:** STABLE (3 tests).
- **Public surface (7):** `StynxStorageModule`, `DocumentsService`,
  `ObjectStoreService`, `S3Service`, errors, tokens, types.
- **Peer deps:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
- **Import when:** any app handling file uploads/downloads.
- **Citation:** `packages/storage/src/index.ts`.

### `@stynx-nyx/health` — v0.1.0

- **Purpose:** `/healthz`, `/readyz`, `/metrics`, `/info` endpoints.
- **Maturity:** STABLE (4 tests).
- **Public surface (6):** `StynxHealthModule`, `HealthController`,
  `HealthService`, `MetricsService`, `InfoGuard`, tokens.
- **Peer deps:** `@nestjs/common`, `prom-client`.
- **Import when:** every consuming app.
- **Citation:** `packages/health/src/index.ts`.

### `@stynx-nyx/logging` — v0.1.0

- **Purpose:** Pino structured logger with redaction; request log
  middleware.
- **Maturity:** STABLE (5 tests).
- **Public surface (6):** `StynxLoggingModule`, `LoggerService`,
  `RequestLoggingMiddleware`, `pinoFactory`, dedupe, tokens.
- **Peer deps:** `pino`, `pino-pretty` (dev).
- **Import when:** every consuming app.
- **Citation:** `packages/logging/src/index.ts`.

### `@stynx-nyx/ratelimit` — v0.1.0

- **Purpose:** Distributed rate limiting (Redis primary, PG fallback).
- **Maturity:** STABLE (3 tests).
- **Public surface (10):** `RateLimitGuard`, `RateLimitModule`,
  `@RateLimit` decorator, `RateLimitPolicyService`,
  `RedisRateLimitStore`, `PgRateLimitStore`, request-context helpers,
  metrics, constants, types.
- **Peer deps:** `@nestjs/common`, `ioredis`, `@stynx-nyx/data`.
- **Import when:** any app exposing public mutation endpoints.
- **Citation:** `packages/ratelimit/src/index.ts`.

### `@stynx-nyx/idempotency` — v0.1.0

- **Purpose:** `Idempotency-Key` header support; replays return the
  original response.
- **Maturity:** STABLE (2 tests).
- **Public surface (10):** `IdempotencyInterceptor`,
  `IdempotencyModule`, `@Idempotent` decorator,
  `DatabaseIdempotencyStore`, `PgIdempotencyStore`,
  `RedisIdempotencyBackend`, request-context helpers, metrics,
  constants, types.
- **Peer deps:** `@nestjs/common`, `ioredis`, `@stynx-nyx/data`.
- **Import when:** any app exposing user-driven mutations that
  benefit from safe retry.
- **Citation:** `packages/idempotency/src/index.ts`.

### `@stynx-nyx/privacy` — v0.1.0

- **Purpose:** LGPD pipeline (export, erasure, ROPA), PII map,
  privacy object store.
- **Maturity:** STABLE (2 tests). **Audit FIND-010 reservation:**
  may still import `@aws-sdk/client-s3` directly (I3 deviation).
- **Public surface (9):** `StynxPrivacyModule`, `PrivacyService`,
  `PrivacyController`, `PiiMapService`, `PrivacyObjectStoreService`,
  ROPA helpers, errors, tokens, types.
- **Peer deps:** `@nestjs/common`, `@stynx-nyx/data`, `@stynx-nyx/storage`.
- **Import when:** any app subject to LGPD/GDPR data subject rights.
- **Citation:** `packages/privacy/src/index.ts`.

### `@stynx-nyx/i18n` — v0.1.0

- **Purpose:** pt-BR + en-US catalog service, locale interceptor,
  error translator.
- **Maturity:** STABLE (1 test).
- **Public surface (9):** `StynxI18nModule`, `LocaleService`,
  `LocaleInterceptor`, `CatalogService`, `I18nAdminService`,
  `I18nController`, `ErrorTranslatorService`, tokens, types.
- **Peer deps:** `@nestjs/common`.
- **Import when:** consumer needs pt-BR or en-US user-facing strings.
- **Citation:** `packages/i18n/src/index.ts`.

### `@stynx-nyx/idempotency` (already covered)

### `@stynx-nyx/health` (already covered)

### `@stynx-nyx/contracts` — v0.2.0

- **Purpose:** Shared TypeScript types across backend, frontend, and
  consuming apps. Closes audit FIND-001.
- **Maturity:** STABLE (no tests; type-only).
- **Public surface (8):** `auth`, `authorization`, `audit`,
  `storage`, `db-context`, `tenancy`, `errors`, `identity-admin`.
- **Peer deps:** none (type-only).
- **Import when:** any app sharing types with the STYNX boundary.
- **Citation:** `packages/contracts/src/index.ts`.

### `@stynx-nyx/backend` — v0.2.0 (composition module, not in spec §3)

- **Purpose:** Wires `@stynx-nyx/*` modules into a single
  NestJS-app-ready surface: `StynxPlatformPipelineModule`,
  `AuditInterceptor`, decorators (`@Audit`, `@Idempotent`,
  `@RateLimit`), authorization guards, db-context interceptor,
  SLA monitor, identity-admin adapters. Aggregates `@stynx-nyx/contracts`.
- **Maturity:** STABLE (44 exports). **No package tests** (composition).
- **Public surface highlights:**
  - `StynxPlatformPipelineModule` (composes the cross-cutting pipeline).
  - `AuditInterceptor`, `STYNX_AUDIT_SINK`.
  - `@Audit`, `@Idempotent`, `@RateLimit` decorators.
  - `AuthorizationGuard`, `AuthContextGuard`.
  - `DbContextInterceptor`, `TenantLifecycleMiddleware`.
  - `IdentityAdminModule`, `PgLocalSyncAdapter`.
  - SLA monitor types and module.
- **Peer deps:** every other `@stynx-nyx/*` it composes.
- **Import when:** Always — replaces hand-wiring of the pipeline.
  See `reference/api/src/app.module.ts:13`.
- **Citation:** `packages/backend/src/index.ts`.

### `@stynx-nyx/testing` — v0.1.0

- **Purpose:** Test fixtures, RLS-leak matchers, LGPD fixture,
  test-app helper, doctor harness.
- **Maturity:** STABLE (1 test of utilities themselves).
- **Public surface (8):** `createTestApp`, fixtures, `LgpdFixture`,
  matchers (incl. RLS leak), `mintTestSession`, doctor harness,
  context helpers, types.
- **Peer deps:** `@nestjs/testing`, `pg`, `testcontainers`.
- **Import when:** every consuming app's test suite.
- **Citation:** `packages/testing/src/index.ts`.

### `@stynx-nyx/cli` — v0.1.0

- **Purpose:** Operational CLI: `stynx init`, `stynx adopt scan/apply`,
  `stynx audit verify`, `stynx doctor`, `stynx migrate (up/down/redo/status)`,
  `stynx privacy ropa`.
- **Maturity:** STABLE (3 tests).
- **Public surface (7):** `cli` (Commander program builder),
  `audit`, `doctor`, `init`, `migrate`, `privacy-ropa`, `adopt`.
- **Peer deps:** `commander`, `@stynx-nyx/data`, `pg`.
- **Import when:** ops scripts, CI pipelines, codemod runs.
- **Citation:** `packages/cli/src/index.ts`.
  **Caveat:** `pnpm exec stynx --help` did not resolve a bin at
  audit time — invoke via `node packages/cli/dist/main.js` or via
  the workspace's top-level `pnpm doctor` script.

---

## Frontend (`packages-web/`)

### `@stynx-nyx/sdk` — v0.1.0

- **Purpose:** Framework-agnostic TypeScript HTTP client.
- **Public surface (14):** OpenAPI-generated client + 401 → refresh
  flow + tenant header injection.
- **Peer deps:** none beyond TS standard library.
- **Import when:** any frontend (Angular or non-Angular).
- **Citation:** `packages-web/sdk/src/index.ts`.

### `@stynx-nyx/angular` — v0.1.0

- **Purpose:** `StynxAngularModule.forRoot`, base interceptors,
  lazy-load infrastructure.
- **Public surface (12):** module, interceptors (auth, tenant,
  request-id, error), config tokens.
- **Peer deps:** `@angular/core`, `@angular/common`, `rxjs`.
- **Import when:** Angular consumer.
- **Citation:** `packages-web/angular/src/index.ts`.

### `@stynx-nyx/angular-auth` — v0.1.0

- **Public surface (13):** OIDC PKCE login flow, session token
  service, permission directive (`*hasPermission`), guards.
- **Peer deps:** `@angular/router`, `@angular/common`.
- **Import when:** Angular consumer with Cognito login.

### `@stynx-nyx/angular-tenancy` — v0.1.0 — **closes audit FIND-002**

- **Public surface (6):** `TenantContextService`, `TenantInterceptor`,
  `TenantSwitcherComponent`, `provideTenancy`, types.
- **Import when:** Angular consumer needing in-app tenant switching.
- **Citation:** `packages-web/angular-tenancy/src/index.ts`.

### `@stynx-nyx/angular-storage` — v0.1.0

- **Public surface (5):** Document upload component, presigned URL
  service.
- **Import when:** Angular consumer with file upload UI.

### `@stynx-nyx/angular-sessions` — v0.1.0

- **Public surface (2):** Session list / revoke component.

### `@stynx-nyx/angular-profile` — v0.1.0

- **Public surface (3):** Profile page component.

### `@stynx-nyx/angular-trash` — v0.1.0

- **Public surface (2):** Generic soft-delete/restore UI.
- **Import when:** Angular consumer wants a built-in trash UI for
  any soft-deletable resource.

### `@stynx-nyx/angular-i18n` — v0.1.0

- **Public surface (6):** Catalog override service, locale switcher,
  translation pipe.

### `@stynx-nyx/angular-ui` — v0.1.0

- **Public surface (8):** Shared UI primitives (buttons, dialogs,
  tables, etc.).

---

## Decision matrix

| Foreign-codebase concern          | STYNX package                                   |
| --------------------------------- | ----------------------------------------------- |
| HTTP request handling baseline    | `@stynx-nyx/core` + `@stynx-nyx/backend`        |
| DB access (read & write)          | `@stynx-nyx/data`                               |
| Multi-tenant context              | `@stynx-nyx/tenancy`                            |
| Auth (Cognito JWT verify, login)  | `@stynx-nyx/auth`                               |
| Session issuance + refresh        | `@stynx-nyx/sessions`                           |
| Audit trail                       | `@stynx-nyx/audit` (read) + DB triggers (write) |
| Structured logs                   | `@stynx-nyx/logging`                            |
| Health/probes/metrics             | `@stynx-nyx/health`                             |
| Rate limiting                     | `@stynx-nyx/ratelimit`                          |
| Idempotency keys                  | `@stynx-nyx/idempotency`                        |
| LGPD export/erasure               | `@stynx-nyx/privacy`                            |
| File uploads / S3                 | `@stynx-nyx/storage`                            |
| i18n catalogs                     | `@stynx-nyx/i18n`                               |
| Test fixtures + matchers          | `@stynx-nyx/testing`                            |
| CLI ops (migrate, doctor)         | `@stynx-nyx/cli`                                |
| Shared TypeScript types           | `@stynx-nyx/contracts`                          |
| Pipeline composition (one module) | `@stynx-nyx/backend`                            |
| Angular HTTP client               | `@stynx-nyx/sdk`                                |
| Angular module + interceptors     | `@stynx-nyx/angular`                            |
| Angular auth UI                   | `@stynx-nyx/angular-auth`                       |
| Angular tenant switcher           | `@stynx-nyx/angular-tenancy`                    |
| Angular file upload               | `@stynx-nyx/angular-storage`                    |
| Angular session list              | `@stynx-nyx/angular-sessions`                   |
| Angular profile                   | `@stynx-nyx/angular-profile`                    |
| Angular trash UI                  | `@stynx-nyx/angular-trash`                      |
| Angular i18n                      | `@stynx-nyx/angular-i18n`                       |
| Angular UI primitives             | `@stynx-nyx/angular-ui`                         |
