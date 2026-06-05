[**@stynx/idempotency**](../index.md)

---

[@stynx/idempotency](../index.md) / IdempotencySqlExecutor

# Interface: IdempotencySqlExecutor

Defined in: [types.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L67)

## Methods

### query()

> **query**\<`T`\>(`sql`, `params?`): `Promise`\<`T`[] \| \{ `rowCount?`: `number`; `rows`: `T`[]; \}\>

Defined in: [types.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L68)

#### Type Parameters

##### T

`T` = `Record`\<`string`, `unknown`\>

#### Parameters

##### sql

`string`

##### params?

readonly `unknown`[]

#### Returns

`Promise`\<`T`[] \| \{ `rowCount?`: `number`; `rows`: `T`[]; \}\>
