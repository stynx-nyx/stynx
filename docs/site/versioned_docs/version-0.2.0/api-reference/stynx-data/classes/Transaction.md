[**@stynx/data**](../index.md)

---

[@stynx/data](../index.md) / Transaction

# Class: Transaction

Defined in: [packages/data/src/transaction.ts:81](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L81)

Transaction and Drizzle helper exports.

## Constructors

### Constructor

> **new Transaction**(`client`, `db`, `role`, `metrics?`): `Transaction`

Defined in: [packages/data/src/transaction.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L84)

#### Parameters

##### client

`PoolClient`

##### db

[`StynxDrizzleDatabase`](../type-aliases/StynxDrizzleDatabase.md)

##### role

[`StynxDataRole`](../type-aliases/StynxDataRole.md)

##### metrics?

[`StynxDataMetricsSink`](../interfaces/StynxDataMetricsSink.md)

#### Returns

`Transaction`

## Properties

### role

> `readonly` **role**: [`StynxDataRole`](../type-aliases/StynxDataRole.md)

Defined in: [packages/data/src/transaction.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L87)

## Methods

### close()

> **close**(): `void`

Defined in: [packages/data/src/transaction.ts:91](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L91)

#### Returns

`void`

---

### delete()

> **delete**\<`TTable`\>(`table`): `PgDeleteBase`\<`TTable`, `NodePgQueryResultHKT`, `undefined`, `undefined`, `false`, `never`\>

Defined in: [packages/data/src/transaction.ts:110](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L110)

#### Type Parameters

##### TTable

`TTable` _extends_ `PgTable`\<`TableConfig`\>

#### Parameters

##### table

`TTable`

#### Returns

`PgDeleteBase`\<`TTable`, `NodePgQueryResultHKT`, `undefined`, `undefined`, `false`, `never`\>

---

### execute()

> **execute**(`query`): `Promise`\<`QueryResult`\<`QueryResultRow`\>\>

Defined in: [packages/data/src/transaction.ts:115](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L115)

#### Parameters

##### query

`SQLWrapper`

#### Returns

`Promise`\<`QueryResult`\<`QueryResultRow`\>\>

---

### hardDelete()

> **hardDelete**\<`T`\>(`table`, `id`, `options`): `Promise`\<`void`\>

Defined in: [packages/data/src/transaction.ts:199](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L199)

#### Type Parameters

##### T

`T` _extends_ `AnyPgTable`

#### Parameters

##### table

[`SoftDeletableTable`](../type-aliases/SoftDeletableTable.md)\<`T`\> \| [`LiveOnlyTable`](../type-aliases/LiveOnlyTable.md)\<`T`\>

##### id

`string`

##### options

[`HardDeleteOptions`](../interfaces/HardDeleteOptions.md)

#### Returns

`Promise`\<`void`\>

---

### hardDeleteFromArchive()

> **hardDeleteFromArchive**(`archiveId`, `options`): `Promise`\<`void`\>

Defined in: [packages/data/src/transaction.ts:213](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L213)

#### Parameters

##### archiveId

`bigint`

##### options

[`HardDeleteFromArchiveOptions`](../interfaces/HardDeleteFromArchiveOptions.md)

#### Returns

`Promise`\<`void`\>

---

### insert()

> **insert**\<`TTable`\>(`table`): `PgInsertBuilder`\<`TTable`, `NodePgQueryResultHKT`, `false`\>

Defined in: [packages/data/src/transaction.ts:100](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L100)

#### Type Parameters

##### TTable

`TTable` _extends_ `PgTable`\<`TableConfig`\>

#### Parameters

##### table

`TTable`

#### Returns

`PgInsertBuilder`\<`TTable`, `NodePgQueryResultHKT`, `false`\>

---

### query()

> **query**\<`TRow`\>(`text`, `values?`): `Promise`\<`QueryResult`\<`TRow`\>\>

Defined in: [packages/data/src/transaction.ts:120](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L120)

#### Type Parameters

##### TRow

`TRow` _extends_ `QueryResultRow` = `QueryResultRow`

#### Parameters

##### text

`string`

##### values?

`unknown`[]

#### Returns

`Promise`\<`QueryResult`\<`TRow`\>\>

---

### restoreFromArchive()

> **restoreFromArchive**\<`T`\>(`table`, `id`, `options?`): `Promise`\<[`RestoreResult`](../interfaces/RestoreResult.md)\>

Defined in: [packages/data/src/transaction.ts:172](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L172)

#### Type Parameters

##### T

`T` _extends_ `AnyPgTable`

#### Parameters

##### table

[`SoftDeletableTable`](../type-aliases/SoftDeletableTable.md)\<`T`\>

##### id

`string`

##### options?

[`RestoreOptions`](../interfaces/RestoreOptions.md) = `{}`

#### Returns

`Promise`\<[`RestoreResult`](../interfaces/RestoreResult.md)\>

---

### restoreWithCascade()

> **restoreWithCascade**\<`T`\>(`table`, `id`, `options?`): `Promise`\<[`RestoreResult`](../interfaces/RestoreResult.md)\>

Defined in: [packages/data/src/transaction.ts:188](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L188)

#### Type Parameters

##### T

`T` _extends_ `AnyPgTable`

#### Parameters

##### table

[`SoftDeletableTable`](../type-aliases/SoftDeletableTable.md)\<`T`\>

##### id

`string`

##### options?

`Omit`\<[`RestoreOptions`](../interfaces/RestoreOptions.md), `"cascade"`\> = `{}`

#### Returns

`Promise`\<[`RestoreResult`](../interfaces/RestoreResult.md)\>

---

### select()

> **select**(): [`TransactionSelectRoot`](../interfaces/TransactionSelectRoot.md)

Defined in: [packages/data/src/transaction.ts:95](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L95)

#### Returns

[`TransactionSelectRoot`](../interfaces/TransactionSelectRoot.md)

---

### softDelete()

#### Call Signature

> **softDelete**\<`T`\>(`table`, `id`, `options`): `Promise`\<[`CascadePlan`](../interfaces/CascadePlan.md)\>

Defined in: [packages/data/src/transaction.ts:128](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L128)

##### Type Parameters

###### T

`T` _extends_ `AnyPgTable`

##### Parameters

###### table

[`SoftDeletableTable`](../type-aliases/SoftDeletableTable.md)\<`T`\>

###### id

`string`

###### options

[`SoftDeleteOptions`](../interfaces/SoftDeleteOptions.md) & `object`

##### Returns

`Promise`\<[`CascadePlan`](../interfaces/CascadePlan.md)\>

#### Call Signature

> **softDelete**\<`T`\>(`table`, `id`, `options?`): `Promise`\<[`SoftDeleteResult`](../interfaces/SoftDeleteResult.md)\>

Defined in: [packages/data/src/transaction.ts:133](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L133)

##### Type Parameters

###### T

`T` _extends_ `AnyPgTable`

##### Parameters

###### table

[`SoftDeletableTable`](../type-aliases/SoftDeletableTable.md)\<`T`\>

###### id

`string`

###### options?

[`SoftDeleteOptions`](../interfaces/SoftDeleteOptions.md)

##### Returns

`Promise`\<[`SoftDeleteResult`](../interfaces/SoftDeleteResult.md)\>

---

### update()

> **update**\<`TTable`\>(`table`): `PgUpdateBuilder`\<`TTable`, `NodePgQueryResultHKT`\>

Defined in: [packages/data/src/transaction.ts:105](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/transaction.ts#L105)

#### Type Parameters

##### TTable

`TTable` _extends_ `PgTable`\<`TableConfig`\>

#### Parameters

##### table

`TTable`

#### Returns

`PgUpdateBuilder`\<`TTable`, `NodePgQueryResultHKT`\>
