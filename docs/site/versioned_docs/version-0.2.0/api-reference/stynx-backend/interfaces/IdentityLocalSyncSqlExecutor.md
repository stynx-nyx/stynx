[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / IdentityLocalSyncSqlExecutor

# Interface: IdentityLocalSyncSqlExecutor

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L16)

## Methods

### query()

> **query**\<`T`\>(`sql`, `params?`, `client?`): `Promise`\<`QueryResult`\<`T`\>\>

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L17)

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### sql

`string`

##### params?

readonly `unknown`[]

##### client?

`unknown`

#### Returns

`Promise`\<`QueryResult`\<`T`\>\>

---

### withTransaction()?

> `optional` **withTransaction**\<`T`\>(`run`, `context?`): `Promise`\<`T`\>

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L22)

#### Type Parameters

##### T

`T`

#### Parameters

##### run

(`client`) => `Promise`\<`T`\>

##### context?

[`IdentitySyncContext`](IdentitySyncContext.md)

#### Returns

`Promise`\<`T`\>
