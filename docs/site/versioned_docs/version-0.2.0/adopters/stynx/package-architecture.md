# stynx Package Architecture

This document is the consumer entrypoint for the installable package topology.
Canonical package docs live in each package README; this page explains how the
packages fit together.

## Workspace Shape

- `packages/*` — backend, data, contracts, CLI, and testing packages published
  as `@stynx-nyx/*`.
- `packages-web/*` — Angular/browser packages published as `@stynx-web/*`.
- `reference/api` and `reference/web` — host applications proving package
  composition.
- `infra/cdk` — standalone AWS CDK reference app for deployed environments.

Legacy `backend/`, `frontend/`, `bootstrap/`, and `test/` roots are not the
package API surface.

## Backend Package Groups

| Group                   | Packages                                                                                     | Purpose                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Contracts               | `@stynx-nyx/contracts`                                                                           | Type-only interfaces and error envelopes shared across packages.                                                 |
| Runtime foundation      | `@stynx-nyx/core`, `@stynx-nyx/data`, `@stynx-nyx/backend`                                               | Request context, config/secrets, data access, and aggregate NestJS platform wiring.                              |
| Security and tenancy    | `@stynx-nyx/auth`, `@stynx-nyx/sessions`, `@stynx-nyx/tenancy`, `@stynx-nyx/ratelimit`, `@stynx-nyx/idempotency` | Authentication, authorization, session lifecycle, tenant resolution, throttling, and mutation replay protection. |
| Observability and audit | `@stynx-nyx/health`, `@stynx-nyx/logging`, `@stynx-nyx/audit`                                            | Health/readiness/metrics, structured logs, audit writing, retention, and evidence queries.                       |
| Data governance         | `@stynx-nyx/privacy`, `@stynx-nyx/storage`, `@stynx-nyx/i18n`                                            | LGPD export/erasure/ROPA, document metadata/object storage, and localized messages.                              |
| Workflow                | `@stynx-nyx/flow`                                                                                | Tenant-scoped workflow design, runtime, forms, policy, analytics, and PORM-compatible migration aliases.         |
| Tooling                 | `@stynx-nyx/cli`, `@stynx-nyx/testing`                                                               | Adoption/migration commands plus reusable test harnesses, fixtures, and matchers.                                |

## Web Package Groups

| Group            | Packages                                                                                                                                                                                                                             | Purpose                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Core browser SDK | `@stynx-web/sdk`, `@stynx-web/angular`, `@stynx-web/angular-ui`                                                                                                                                                                      | Fetch/auth helpers, Angular providers, and shared UI primitives. |
| Feature packages | `@stynx-web/angular-auth`, `@stynx-web/angular-sessions`, `@stynx-web/angular-tenancy`, `@stynx-web/angular-storage`, `@stynx-web/angular-trash`, `@stynx-web/angular-profile`, `@stynx-web/angular-flow`, `@stynx-web/angular-i18n` | Host-mounted Angular surfaces for framework features.            |

## Recommended Backend Wiring

For a NestJS host, start with the foundation packages and add features:

```ts
@Module({
  imports: [
    StynxCoreModule.forRoot(coreOptions),
    StynxDataModule.forRoot(dataOptions),
    StynxAuthModule.forRoot(authOptions),
    StynxTenancyModule.forRoot(tenancyOptions),
    StynxAuditModule.forRoot(auditOptions),
    StynxStorageModule.forRoot(storageOptions),
    StynxHealthModule.forRoot(healthOptions),
  ],
})
export class AppModule {}
```

`@stynx-nyx/backend` remains the compatibility aggregation package for existing
hosts that want one import surface for shared backend modules. New code should
prefer direct package imports when that keeps ownership clearer.

## Data And Security Invariants

- New mutable curated tables must carry tenant/RLS behavior where applicable
  and DML audit triggers by default.
- Direct PostgreSQL imports stay in `@stynx-nyx/data` and approved CLI/test
  utilities.
- Storage, privacy, audit, tenancy, and sessions must not bypass their owning
  package abstractions.
- Reference apps are examples of composition; they are not package internals.

## Documentation Contract

Every active backend package has a package README. The baseline is documented in
[Developer Documentation Standard](../../framework/arch/developer-documentation.md)
and [Package README Template](../../meta/templates/package-README.md).

Public package barrels must carry package-level `@packageDocumentation`.
Symbol-level TSDoc is required when an exported contract has non-obvious
runtime, data, tenant, privacy, or security implications.

## Verification

Use package-local commands for focused work:

```sh
pnpm --filter @stynx-nyx/data test
pnpm --filter @stynx-nyx/flow test
pnpm --filter @stynx-web/angular-flow test
```

Use docs build to verify package API reference generation:

```sh
pnpm --filter docs build
```
