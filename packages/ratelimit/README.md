# @stynx/ratelimit

Rate-limit decorators, guards, policy resolution, metrics, and Redis/Postgres stores.

## Public API

- `export * from './constants'`
- `export * from './decorators'`
- `export * from './metrics'`
- `export * from './pg-rate-limit.store'`
- `export * from './rate-limit-policy.service'`
- `export * from './rate-limit.guard'`
- `export * from './rate-limit.module'`
- `export * from './redis-rate-limit.store'`
- `export * from './request-context'`
- `export * from './types'`

## Peer Dependencies

- `@nestjs/common` ^11.1.19
- `@nestjs/core` ^11.1.19
- `reflect-metadata` ^0.2.2
- `rxjs` ^7.8.2

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 0.1.0           | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [STYNX Spec section 3](../../specs/STYNX-SPEC-v0.6.md)
- [Package README template](../../docs/templates/package-README.md)
