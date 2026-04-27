# @stynx/data

Database access foundation with three-role pools, migrations, transactions, schema exports, and archive helpers.

## Public API

- `export { StynxDataModule, StynxDataModule as DataModule } from './data.module'`
- `export { Database } from './database'`
- `export { Transaction, createDrizzle, type StynxDrizzleDatabase } from './transaction'`
- `export { StynxPoolRegistry, createStynxPgPool, type StynxPgPoolOptions } from './pools'`
- `export { createStynxPgClient, type StynxPgClient, type StynxPgClientConfig } from './client'`
- `export { withSystemContext } from './system-context'`
- `export * from './table-markers'`
- `export * from './types'`
- `export * from './errors'`
- `export * from './tokens'`
- `export * from './schema'`
- `export * from './query-helpers'`

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
