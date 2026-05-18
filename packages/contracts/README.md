# @stynx/contracts

Framework-agnostic TypeScript contracts shared by backend, storage, audit, identity, tenancy, and authorization packages.

## Purpose

Framework-agnostic TypeScript contracts shared by backend, storage, audit, identity, tenancy, and authorization packages.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/contracts';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

No NestJS module setup is required. This package must remain implementation-free and safe to import from any STYNX package that needs shared types.

## Data And Security Model

Owns type-level contracts only. It must not open network connections, read secrets, import NestJS providers, or depend on package runtime implementations.

## Example

```ts
import type { Principal, AuthorizationRequirements } from '@stynx/contracts';

function canEvaluate(principal: Principal, requirements: AuthorizationRequirements) {
  return principal.permissions.length >= requirements.permissions.length;
}
```

## Public API

- auth principals and token verifier contracts
- authorization requirement and policy evaluator contracts
- audit envelopes and sink contracts
- storage object/document contracts
- DB context and tenancy contracts
- shared errors and identity-admin contracts

Current barrel highlights:

- `export * from './auth'`
- `export * from './authorization'`
- `export * from './audit'`
- `export * from './storage'`
- `export * from './db-context'`
- `export * from './tenancy'`
- `export * from './errors'`
- `export * from './identity-admin'`

## Verification

```sh
pnpm --filter @stynx/contracts build
pnpm --filter @stynx/contracts test
```

## Documentation Standard

The public barrel must carry package-level `@packageDocumentation`. Add symbol-level TSDoc for exported services, modules, guards, interceptors, decorators, adapters, errors, and public options when the type name is not self-explanatory.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [docs/architecture/developer-documentation.md](../../docs/architecture/developer-documentation.md)
- [docs/stynx/package-architecture.md](../../docs/stynx/package-architecture.md)
- [docs/contracts/README.md](../../docs/contracts/README.md)
