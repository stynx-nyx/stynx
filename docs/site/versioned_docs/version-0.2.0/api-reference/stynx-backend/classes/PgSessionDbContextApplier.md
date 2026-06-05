[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / PgSessionDbContextApplier

# Class: PgSessionDbContextApplier

Defined in: [packages/backend/src/db-context/pg-session-db-context.applier.ts:95](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/pg-session-db-context.applier.ts#L95)

Default Postgres session context applier for stynx.

Mirrors the proven cross-repo pattern:

- enables `row_security`
- writes request-scoped principal/tenant/session keys via `set_config(...)`

## Implements

- [`DbContextApplier`](../interfaces/DbContextApplier.md)\<[`PgQueryableClient`](../interfaces/PgQueryableClient.md)\>

## Constructors

### Constructor

> **new PgSessionDbContextApplier**(`options?`): `PgSessionDbContextApplier`

Defined in: [packages/backend/src/db-context/pg-session-db-context.applier.ts:105](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/pg-session-db-context.applier.ts#L105)

#### Parameters

##### options?

[`PgSessionDbContextApplierOptions`](../interfaces/PgSessionDbContextApplierOptions.md) = `{}`

#### Returns

`PgSessionDbContextApplier`

## Methods

### apply()

> **apply**(`client`, `context`): `Promise`\<`void`\>

Defined in: [packages/backend/src/db-context/pg-session-db-context.applier.ts:114](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/pg-session-db-context.applier.ts#L114)

#### Parameters

##### client

[`PgQueryableClient`](../interfaces/PgQueryableClient.md)

##### context

[`DbSessionContext`](../interfaces/DbSessionContext.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`DbContextApplier`](../interfaces/DbContextApplier.md).[`apply`](../interfaces/DbContextApplier.md#apply)
