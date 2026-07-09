[**@stynx-nyx/core**](../index.md)

---

[@stynx-nyx/core](../index.md) / Database

# Abstract Class: Database

Defined in: [packages/core/src/database.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/database.ts#L8)

## Constructors

### Constructor

> **new Database**(): `Database`

#### Returns

`Database`

## Methods

### withSystemContext()

> `abstract` **withSystemContext**\<`T`\>(`reason`, `fn`): `Promise`\<`T`\>

Defined in: [packages/core/src/database.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/database.ts#L9)

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
