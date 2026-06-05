[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / loadPormRoleMetaRows

# Function: loadPormRoleMetaRows()

> **loadPormRoleMetaRows**(`db`, `options?`): `Promise`\<[`IdentityGroupMetaRow`](../interfaces/IdentityGroupMetaRow.md)[]\>

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:442](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L442)

PORM-compatible role metadata loader. Optional helper used by
PgIdentityLocalSyncAdapter.loadGroupMetaRows.

## Parameters

### db

[`IdentityLocalSyncSqlExecutor`](../interfaces/IdentityLocalSyncSqlExecutor.md)

### options?

[`PormRoleMetaLoaderOptions`](../interfaces/PormRoleMetaLoaderOptions.md) = `{}`

## Returns

`Promise`\<[`IdentityGroupMetaRow`](../interfaces/IdentityGroupMetaRow.md)[]\>
