# 04 — Package Layout

## Workspace Structure

`pnpm-workspace.yaml`:

```yaml
packages:
  - 'backend' # FIND-007
  - 'bootstrap' # FIND-007
  - 'frontend' # FIND-007
  - 'packages/*'
  - 'packages-web/*'
  - 'apps/*'
  - 'test/*' # FIND-007
  - 'tools/*'
  - 'docs'
```

Spec §3 wants `packages/*`, `packages-web/*`, `apps/*`, `tools/*` only.
The four extras (`backend`, `bootstrap`, `frontend`, `test/*`) are drift —
see [01](01-COMPLETENESS-MATRIX.md) and FIND-007.

`pnpm -r ls` confirms 41 live workspaces. Notable surprises:

- `apps/reference-frontend` (`@stech/reference-frontend@0.2.0`, FIND-003) —
  not in spec; `@stech/*` scope.
- `packages/stynx-{backend,contracts,frontend-client,frontend-contracts}`
  in `@stech/*` scope (FIND-006). They build, but they predate the
  rationalization.
- `backend@0.1.0`, `bootstrap@0.1.0` at root.

## Inter-Package Boundaries

All package `exports` fields are single-barrel (`'.'` only) per a sweep
of `package.json` files — **PASS** for encapsulation. No deep paths
exposed in any sampled package.

A `data/internal/archive-schema.ts` module exists; it is imported only
within `packages/data/` (the `internal/` segment is a convention).
ESLint's `eslint-plugin-boundaries` is in devDependencies but no audit
of the rule set was performed — UNKNOWN whether it actively rejects
deep imports across packages. FIND-021.

## Dependency Graph

Build order observed via `pnpm -w typecheck` (60 tasks). The DAG
inferred from `dependencies` fields:

| Layer | Packages                                       | Depends on                                      |
| ----- | ---------------------------------------------- | ----------------------------------------------- |
| 0     | `core`                                         | (none)                                          |
| 1     | `tenancy`, `logging`, `health`                 | `core`                                          |
| 2     | `data`                                         | `core`                                          |
| 3     | `sessions`                                     | `core`, `data`                                  |
| 4     | `auth`                                         | `core`, `data`, `sessions`, **`idempotency`** ⚠ |
| 5     | `audit`, `storage`, `ratelimit`, `idempotency` | `auth`, `data`                                  |
| 6     | `privacy`, `i18n`                              | `core`, `data`                                  |
| 7     | `testing`, `cli`                               | (varies)                                        |
| 8     | `apps/*`, `packages-web/*`                     | upstream                                        |

### Layering issues

The spec §3 layered DAG is "core → tenancy/logging/health → data →
sessions → auth → audit/storage/ratelimit/idempotency → privacy/i18n →
testing/cli". But:

- **`auth` depends on `idempotency`** (forward dep). The spec places
  idempotency _above_ auth, so this is a layering inversion. It may be
  intentional (idempotency keys gating auth flows) but it is at minimum
  a documentation gap. FIND-022 (MINOR).
- No circular dependencies were found in `package.json` analysis. `madge
--circular` was not executed (would catch transitive cycles); UNKNOWN
  on transitives. FIND-023.

### Cross-namespace cleanliness — **PASS**

- No `@stynx/*` package depends on `@stynx-web/*`.
- No `@stynx-web/*` package depends on `@stynx/*` source (they share
  contracts via `@stynx-web/sdk`, not direct).

## Peer Dependency Hygiene — **PASS**

Sampled across all `@stynx/*` packages:

- `@nestjs/common`, `@nestjs/core` declared as `peerDependencies`
  (versions `^11.1.19`).
- `reflect-metadata`, `rxjs` as `peerDependencies`.
- `@stynx/testing` correctly elevates NestJS to `dependencies`
  (test harness consumes them directly).
- `@stynx/cli` carries no NestJS deps (correct — it is a standalone CLI).

`@aws-sdk/*` distribution is clean:

- `@aws-sdk/client-s3` → `storage`, `privacy` (privacy is the I3 violator;
  see [02](02-SPEC-ADHERENCE.md))
- `@aws-sdk/client-cognito-identity-provider`, `credential-providers` →
  `auth`
- `@aws-sdk/client-secrets-manager`, `client-ssm` → `core`

No AWS SDK leakage into `@stynx-web/*` or unexpected packages.

## Findings (cross-referenced into the register)

- FIND-003 — Unexpected `apps/reference-frontend`
- FIND-006 — Legacy `@stech/*` packages in `packages/`
- FIND-007 — Non-spec workspace globs in `pnpm-workspace.yaml`
- FIND-021 — Boundaries plugin presence not verified for active rules
- FIND-022 — `auth → idempotency` inversion
- FIND-023 — Circular-dependency check not run (UNKNOWN-edges)
