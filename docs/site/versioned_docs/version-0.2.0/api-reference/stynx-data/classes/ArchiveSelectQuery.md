[**@stynx/data**](../index.md)

---

[@stynx/data](../index.md) / ArchiveSelectQuery

# Class: ArchiveSelectQuery\<TTable, TMode\>

Defined in: [packages/data/src/query-helpers.ts:124](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L124)

## Type Parameters

### TTable

`TTable` _extends_ `AnyPgTable`

### TMode

`TMode` _extends_ [`ArchiveMode`](../type-aliases/ArchiveMode.md)

## Implements

- `PromiseLike`\<[`ArchiveQueryRow`](../type-aliases/ArchiveQueryRow.md)\<`TTable`, `TMode`\>[]\>

## Constructors

### Constructor

> **new ArchiveSelectQuery**\<`TTable`, `TMode`\>(`client`, `builder`, `table`, `mode`): `ArchiveSelectQuery`\<`TTable`, `TMode`\>

Defined in: [packages/data/src/query-helpers.ts:133](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L133)

#### Parameters

##### client

`PoolClient`

##### builder

[`SelectBuilderLike`](../type-aliases/SelectBuilderLike.md)

##### table

`TTable`

##### mode

`TMode`

#### Returns

`ArchiveSelectQuery`\<`TTable`, `TMode`\>

## Methods

### catch()

> **catch**\<`TResult`\>(`onrejected?`): `Promise`\<[`ArchiveQueryRow`](../type-aliases/ArchiveQueryRow.md)\<`TTable`, `TMode`\>[] \| `TResult`\>

Defined in: [packages/data/src/query-helpers.ts:284](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L284)

#### Type Parameters

##### TResult

`TResult` = `never`

#### Parameters

##### onrejected?

((`reason`) => `TResult` \| `PromiseLike`\<`TResult`\>) \| `null`

#### Returns

`Promise`\<[`ArchiveQueryRow`](../type-aliases/ArchiveQueryRow.md)\<`TTable`, `TMode`\>[] \| `TResult`\>

---

### execute()

> **execute**(): `Promise`\<[`ArchiveQueryRow`](../type-aliases/ArchiveQueryRow.md)\<`TTable`, `TMode`\>[]\>

Defined in: [packages/data/src/query-helpers.ts:271](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L271)

#### Returns

`Promise`\<[`ArchiveQueryRow`](../type-aliases/ArchiveQueryRow.md)\<`TTable`, `TMode`\>[]\>

---

### finally()

> **finally**(`onfinally?`): `Promise`\<[`ArchiveQueryRow`](../type-aliases/ArchiveQueryRow.md)\<`TTable`, `TMode`\>[]\>

Defined in: [packages/data/src/query-helpers.ts:290](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L290)

#### Parameters

##### onfinally?

(() => `void`) \| `null`

#### Returns

`Promise`\<[`ArchiveQueryRow`](../type-aliases/ArchiveQueryRow.md)\<`TTable`, `TMode`\>[]\>

---

### limit()

> **limit**(`limit`): `this`

Defined in: [packages/data/src/query-helpers.ts:156](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L156)

#### Parameters

##### limit

`number`

#### Returns

`this`

---

### offset()

> **offset**(`offset`): `this`

Defined in: [packages/data/src/query-helpers.ts:161](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L161)

#### Parameters

##### offset

`number`

#### Returns

`this`

---

### orderBy()

> **orderBy**(...`columns`): `this`

Defined in: [packages/data/src/query-helpers.ts:151](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L151)

#### Parameters

##### columns

...(`SQL`\<`unknown`\> \| `PgColumn`\<`ColumnBaseConfig`\<`ColumnDataType`, `string`\>, \{ \}, \{ \}\> \| `Aliased`\<`unknown`\>)[]

#### Returns

`this`

---

### then()

> **then**\<`TResult1`, `TResult2`\>(`onfulfilled?`, `onrejected?`): `Promise`\<`TResult1` \| `TResult2`\>

Defined in: [packages/data/src/query-helpers.ts:277](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L277)

Attaches callbacks for the resolution and/or rejection of the Promise.

#### Type Parameters

##### TResult1

`TResult1` = [`ArchiveQueryRow`](../type-aliases/ArchiveQueryRow.md)\<`TTable`, `TMode`\>[]

##### TResult2

`TResult2` = `never`

#### Parameters

##### onfulfilled?

((`value`) => `TResult1` \| `PromiseLike`\<`TResult1`\>) \| `null`

The callback to execute when the Promise is resolved.

##### onrejected?

((`reason`) => `TResult2` \| `PromiseLike`\<`TResult2`\>) \| `null`

The callback to execute when the Promise is rejected.

#### Returns

`Promise`\<`TResult1` \| `TResult2`\>

A Promise for the completion of which ever callback is executed.

#### Implementation of

`PromiseLike.then`

---

### toSQL()

> **toSQL**(): [`BuiltQuery`](../interfaces/BuiltQuery.md)

Defined in: [packages/data/src/query-helpers.ts:166](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L166)

#### Returns

[`BuiltQuery`](../interfaces/BuiltQuery.md)

---

### where()

> **where**(`where`): `this`

Defined in: [packages/data/src/query-helpers.ts:146](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L146)

#### Parameters

##### where

`SQL`\<`unknown`\> \| `undefined`

#### Returns

`this`
