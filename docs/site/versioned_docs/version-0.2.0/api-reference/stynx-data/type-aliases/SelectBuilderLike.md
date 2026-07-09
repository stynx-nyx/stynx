[**@stynx-nyx/data**](../index.md)

---

[@stynx-nyx/data](../index.md) / SelectBuilderLike

# Type Alias: SelectBuilderLike

> **SelectBuilderLike** = `object`

Defined in: [packages/data/src/query-helpers.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L15)

## Properties

### config

> **config**: `object`

Defined in: [packages/data/src/query-helpers.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L16)

#### limit?

> `optional` **limit?**: `number`

#### offset?

> `optional` **offset?**: `number`

#### orderBy?

> `optional` **orderBy?**: (`PgColumn` \| `SQL` \| `SQL.Aliased`)[]

#### where?

> `optional` **where?**: `SQL`

---

### dialect

> **dialect**: `object`

Defined in: [packages/data/src/query-helpers.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L22)

#### sqlToQuery()

> **sqlToQuery**(`query`): `object`

##### Parameters

###### query

`SQL`

##### Returns

`object`

###### params

> **params**: `unknown`[]

###### sql

> **sql**: `string`
