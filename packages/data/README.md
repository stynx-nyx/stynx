# `@stynx-nyx/data` — Drizzle-backed DB substrate with RLS-aware request scoping + soft-delete

`@stynx-nyx/data` is the data-access substrate every STYNX persistence-touching package consumes. It wraps Drizzle ORM with: a request-scoped DB connection that carries `tenantId` + `actorId` into Postgres via `SET LOCAL` (RLS-aware), a transactional `Database` service, pool-registry helpers for multi-connection apps, soft-delete cascade primitives per `ADR-001-soft-delete`, archive-aware query helpers, and CLI-controlled migration runners.

## Purpose

Multi-tenant Postgres apps need RLS policies pinned to a request-scoped session context, plus consistent soft-delete (with archive cascades) and a predictable migration runner. Doing each of these by hand is error-prone — request-context drift causes RLS bypass; soft-delete done per-table leaks deleted rows. `@stynx-nyx/data` centralises it.

You reach for `@stynx-nyx/data` after `@stynx-nyx/core` whenever the app talks to Postgres. The default Postgres impl is paired with `DbContextApplier` from `@stynx-nyx/contracts`; custom dialects implement a different applier.

What it does NOT do: it doesn't define your schema (Drizzle's `pgTable()` does; you author it). It doesn't enforce RLS policies (your SQL migrations create them; this package PROJECTS the session context they read). It doesn't include a query builder beyond Drizzle.

## Audience

Backend developers building any STYNX app with Postgres persistence.

## Install

```bash
pnpm add @stynx-nyx/data drizzle-orm pg
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `@stynx-nyx/contracts` `^1`, `drizzle-orm` `^0.34`, `pg` `^8`.

## Quick start

```ts
import { StynxDataModule } from '@stynx-nyx/data';
import * as schema from './schema';

StynxDataModule.forRoot({
  connection: { url: process.env.DATABASE_URL },
  schema,
});
```

```ts
import { Database } from '@stynx-nyx/data';

@Injectable()
export class OrdersRepo {
  constructor(private readonly db: Database) {}

  async list() {
    // request-scoped; SET LOCAL applied so RLS sees tenant + actor
    return this.db.select().from(schema.orders);
  }
}
```

## Public API surface

### Modules

| Export                                 | Signature                             | Description                                                                 |
| -------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `StynxDataModule` (alias `DataModule`) | `.forRoot(options: StynxDataOptions)` | Registers the pool, `Database`, the `DbContextApplier`, transaction helper. |

### Services / Injectables

| Export                                                          | Description                                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `Database`                                                      | Request-scoped Drizzle wrapper. Reads `RequestContext` and applies `SET LOCAL` per query/transaction. |
| `Transaction`                                                   | Helper for explicit transactions across multiple ops; nests cleanly inside `Database`.                |
| `StynxPoolRegistry`                                             | Multi-pool registry; useful for read-replica routing or per-tenant connection pinning.                |
| `StynxPgClient`                                                 | Lower-level Postgres client; exposed for tests + CLI utilities.                                       |
| `PgSessionDbContextApplier` (re-exported from `@stynx-nyx/backend`) | The default `DbContextApplier<PostgresClient>` — `SET LOCAL` for RLS.                                 |

### Functions

| Export                | Signature                                | Description                                                    |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| `createDrizzle`       | `(client, schema): StynxDrizzleDatabase` | Build a typed Drizzle instance from a connection + schema.     |
| `createStynxPgPool`   | `(options: StynxPgPoolOptions): Pool`    | Build a Postgres pool with STYNX defaults (idle timeout, max). |
| `createStynxPgClient` | `(options): StynxPgClient`               | Test-friendly factory.                                         |

### Soft-delete + archive helpers

| Export               | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `archiveWhereActive` | Predicate helper that filters out soft-deleted rows.                    |
| `cascadeSoftDelete`  | Walks FK relationships per ADR-001 and applies the cascade.             |
| `restoreCascade`     | Reverses a soft-delete cascade if no conflicting parent archive exists. |

### Types / Interfaces

| Export                   | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| `StynxDataOptions`       | `forRoot()` options.                                       |
| `StynxDrizzleDatabase`   | Typed Drizzle DB instance for your schema.                 |
| `StynxPgPoolOptions`     | Pool options.                                              |
| `SystemExecutionContext` | Cited from `@stynx-nyx/core`; marks system-context operations. |

## Configuration

### `StynxDataModule.forRoot()` options

| Option                     | Type               | Default                     | Description                                               |
| -------------------------- | ------------------ | --------------------------- | --------------------------------------------------------- |
| `connection.url`           | `string`           | `process.env.DATABASE_URL`  | Postgres URL.                                             |
| `connection.poolMax`       | `number`           | `10`                        | Max pool size.                                            |
| `connection.idleTimeoutMs` | `number`           | `30_000`                    | Idle timeout.                                             |
| `schema`                   | `DrizzleSchema`    | (required)                  | Your Drizzle schema barrel.                               |
| `applier`                  | `DbContextApplier` | `PgSessionDbContextApplier` | Custom DB-session-context applier (non-Postgres dialect). |
| `multiPool`                | `boolean`          | `false`                     | Enable `StynxPoolRegistry` for multi-pool apps.           |

## Examples

### Example 1 — tenant-scoped read

```ts
async list() {
  // tenantId pulled from RequestContext; SET LOCAL stynx_tenant_id applied
  return this.db.select().from(schema.orders);
}
```

### Example 2 — explicit transaction

```ts
async chargeAndAudit(input: ChargeInput) {
  await this.db.transaction(async (tx) => {
    await tx.insert(schema.charges).values({...});
    await tx.insert(schema.auditLog).values({...});
  });
}
```

### Example 3 — archive-aware query

```ts
import { archiveWhereActive } from '@stynx-nyx/data';

return this.db.select().from(schema.orders).where(archiveWhereActive(schema.orders));
```

## Common pitfalls

- **Querying outside a request frame** — `RequestContext` is missing, so `SET LOCAL` doesn't fire and RLS may reject (or worse: silently leak across tenants). Use `SystemContext` from `@stynx-nyx/core` for cron/queue contexts.
- **Forgetting `cascadeSoftDelete`** when soft-deleting a parent — children remain "alive" in the DB and leak in subsequent queries.
- **Multi-pool registry with tenant-pinning** — each tenant's queries go through a single pool; a hot tenant can saturate its pool while others sit idle. Monitor per-pool pressure.
- **Raw SQL bypassing `Database`** — bypasses `SET LOCAL`, so RLS sees no context. Always go through `db.execute()` or higher.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContext` the applier reads.
- [`@stynx-nyx/contracts`](/docs/packages/contracts/) — defines `DbContextApplier` + `DbSessionContext` interfaces.
- [`@stynx-nyx/tenancy`](/docs/packages/tenancy/) — populates `tenantId` the applier projects.
- [`@stynx-nyx/idempotency`](/docs/packages/idempotency/) — Postgres store shares this package's connection for transactional consistency.
- [`backend/db-context`](/docs/packages/backend/db-context/) — `@stynx-nyx/backend` submodule that wraps this package.
- [`@stynx-web/angular-trash`](/docs/packages-web/angular-trash/) — Angular UI for soft-delete recovery (consumes archive primitives from this package).

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-data/`](/docs/api-reference/stynx-data/)
