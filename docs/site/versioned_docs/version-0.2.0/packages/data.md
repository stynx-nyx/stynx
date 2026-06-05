---
title: '@stynx/data'
---

# @stynx/data

Data access foundation for PostgreSQL pools, migrations, Drizzle schemas, transactions, archive-aware helpers, and SQL policy boundaries.

## Purpose

Data access foundation for PostgreSQL pools, migrations, Drizzle schemas, transactions, archive-aware helpers, and SQL policy boundaries.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/data';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

Import `StynxDataModule` once per host and provide owner/app/reader connection configuration.

```ts
@Module({
  imports: [StynxDataModule.forRoot({ connections, migrations })],
})
export class DataHostModule {}
```

## Data And Security Model

Owns direct PostgreSQL access for framework packages. New curated tables must preserve tenant/RLS expectations and DML audit trigger coverage. Other packages should consume data services instead of importing pg directly.

## Example

```ts
import { Database, Transaction } from '@stynx/data';

await db.transaction(async (tx: Transaction) => {
  await tx.execute(sql);
});
```

## Public API

- StynxDataModule
- Database
- Transaction and Drizzle helpers
- PostgreSQL pool registry/client helpers
- system-context helper
- schema exports, query helpers, table markers, errors, and tokens

Current barrel highlights:

- `export &#123; StynxDataModule, StynxDataModule as DataModule &#125; from './data.module'`
- `export &#123; Database &#125; from './database'`
- `export &#123; Transaction, createDrizzle, type StynxDrizzleDatabase &#125; from './transaction'`
- `export &#123; StynxPoolRegistry, createStynxPgPool, type StynxPgPoolOptions &#125; from './pools'`
- `export &#123; createStynxPgClient, type StynxPgClient, type StynxPgClientConfig &#125; from './client'`
- `export &#123; withSystemContext &#125; from './system-context'`
- `export * from './table-markers'`
- `export * from './types'`
- `export * from './errors'`
- `export * from './tokens'`
- `export * from './schema'`
- `export * from './query-helpers'`
- See `src/index.ts` for the complete public barrel.

## Verification

```sh
pnpm --filter @stynx/data build
pnpm --filter @stynx/data test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/data test:int
```

## Documentation Standard

The public barrel must carry package-level `@packageDocumentation`. Add symbol-level TSDoc for exported services, modules, guards, interceptors, decorators, adapters, errors, and public options when the type name is not self-explanatory.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [docs/framework/arch/developer-documentation.md](../../docs/framework/arch/developer-documentation.md)
- [docs/stynx/package-architecture.md](/docs/narrative/stynx/package-architecture)
- [docs/framework/arch/STYNX-API-DATA.md](../../docs/framework/arch/STYNX-API-DATA.md)
- [docs/framework/arch/README.md](../../docs/framework/arch/README.md)
