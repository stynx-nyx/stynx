# @stynx/logging

Structured logging, request logging middleware, logger service, and dedupe utilities.

## Public API

- `export * from './dedupe'`
- `export * from './logger.service'`
- `export * from './logging.module'`
- `export * from './pino.factory'`
- `export * from './request-logging.middleware'`
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
