[**@stynx/data**](../index.md)

---

[@stynx/data](../index.md) / Database

# Class: Database

Defined in: [packages/data/src/database.ts:64](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/database.ts#L64)

Database service export.

## Extends

- `Database`

## Constructors

### Constructor

> **new Database**(`requestContext`, `systemContext`, `pools`, `cls`, `options`, `metrics?`): `Database`

Defined in: [packages/data/src/database.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/database.ts#L65)

#### Parameters

##### requestContext

`RequestContext`

##### systemContext

`SystemContext`

##### pools

[`StynxPoolRegistry`](StynxPoolRegistry.md)

##### cls

`ClsService`\<`Record`\<`PropertyKey`, `unknown`\>\>

##### options

[`StynxDataModuleOptions`](../interfaces/StynxDataModuleOptions.md)

##### metrics?

[`StynxDataMetricsSink`](../interfaces/StynxDataMetricsSink.md)

#### Returns

`Database`

#### Overrides

`CoreDatabase.constructor`

## Methods

### tx()

> **tx**\<`T`\>(`fn`, `options?`): `Promise`\<`T`\>

Defined in: [packages/data/src/database.ts:79](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/database.ts#L79)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

(`trx`) => `Promise`\<`T`\>

##### options?

[`TxOptions`](../interfaces/TxOptions.md) = `{}`

#### Returns

`Promise`\<`T`\>

---

### withReplica()

> **withReplica**\<`T`\>(`fn`): `Promise`\<`T`\>

Defined in: [packages/data/src/database.ts:149](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/database.ts#L149)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

(`trx`) => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

---

### withSystemContext()

> **withSystemContext**\<`T`\>(`reason`, `fn`): `Promise`\<`T`\>

Defined in: [packages/data/src/database.ts:153](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/database.ts#L153)

#### Type Parameters

##### T

`T`

#### Parameters

##### reason

`string`

##### fn

(`context`) => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

#### Overrides

`CoreDatabase.withSystemContext`
