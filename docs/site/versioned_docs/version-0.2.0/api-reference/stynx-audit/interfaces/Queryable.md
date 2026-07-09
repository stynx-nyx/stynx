[**@stynx-nyx/audit**](../index.md)

---

[@stynx-nyx/audit](../index.md) / Queryable

# Interface: Queryable

Defined in: [test-helpers.ts:1](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/test-helpers.ts#L1)

## Methods

### query()

> **query**\<`T`\>(`sql`, `params?`): `Promise`\<\{ `rows`: `T`[]; \}\>

Defined in: [test-helpers.ts:2](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/test-helpers.ts#L2)

#### Type Parameters

##### T

`T` _extends_ `object`

#### Parameters

##### sql

`string`

##### params?

`unknown`[]

#### Returns

`Promise`\<\{ `rows`: `T`[]; \}\>
