[**@stynx/ratelimit**](../index.md)

---

[@stynx/ratelimit](../index.md) / RateLimitSqlExecutor

# Interface: RateLimitSqlExecutor

Defined in: [types.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L65)

## Methods

### query()

> **query**\<`T`\>(`sql`, `params?`): `Promise`\<`T`[] \| \{ `rowCount?`: `number`; `rows`: `T`[]; \}\>

Defined in: [types.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/types.ts#L66)

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
