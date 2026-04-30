# @stynx/core

Core request context, configuration, error handling, secret loading, and shared runtime tokens.

## Public API

- `export * from './core.module'`
- `export * from './config'`
- `export * from './database'`
- `export * from './error.filter'`
- `export * from './errors'`
- `export * from './request-context'`
- `export * from './request-context.interceptor'`
- `export * from './request-id'`
- `export * from './secret-loader'`
- `export * from './system-context'`
- `export * from './tokens'`

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
