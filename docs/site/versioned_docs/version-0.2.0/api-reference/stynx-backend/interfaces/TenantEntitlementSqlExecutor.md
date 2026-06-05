[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / TenantEntitlementSqlExecutor

# Interface: TenantEntitlementSqlExecutor

Defined in: [packages/backend/src/auth/sql-tenant-entitlement.fallback.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/sql-tenant-entitlement.fallback.ts#L6)

## Methods

### query()

> **query**\<`T`\>(`sql`, `params?`): `Promise`\<`RowResult`\<`T`\>\>

Defined in: [packages/backend/src/auth/sql-tenant-entitlement.fallback.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/sql-tenant-entitlement.fallback.ts#L7)

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### sql

`string`

##### params?

readonly `unknown`[]

#### Returns

`Promise`\<`RowResult`\<`T`\>\>
