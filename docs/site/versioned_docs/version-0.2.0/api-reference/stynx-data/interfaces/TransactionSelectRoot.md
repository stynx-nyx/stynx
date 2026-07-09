[**@stynx-nyx/data**](../index.md)

---

[@stynx-nyx/data](../index.md) / TransactionSelectRoot

# Interface: TransactionSelectRoot

Defined in: [packages/data/src/query-helpers.ts:69](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L69)

## Methods

### from()

#### Call Signature

> **from**\<`TTable`\>(`table`): [`SoftDeleteAwareSelect`](../type-aliases/SoftDeleteAwareSelect.md)\<`TTable`\>

Defined in: [packages/data/src/query-helpers.ts:70](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L70)

##### Type Parameters

###### TTable

`TTable` _extends_ [`SoftDeletableTable`](../type-aliases/SoftDeletableTable.md)\<`AnyPgTable`\>

##### Parameters

###### table

`TTable`

##### Returns

[`SoftDeleteAwareSelect`](../type-aliases/SoftDeleteAwareSelect.md)\<`TTable`\>

#### Call Signature

> **from**\<`TTable`\>(`table`): `PgSelectBase`

Defined in: [packages/data/src/query-helpers.ts:71](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L71)

##### Type Parameters

###### TTable

`TTable` _extends_ `AnyPgTable`

##### Parameters

###### table

`TTable`

##### Returns

`PgSelectBase`
