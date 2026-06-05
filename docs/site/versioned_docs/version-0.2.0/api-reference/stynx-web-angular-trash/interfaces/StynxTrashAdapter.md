[**@stynx-web/angular-trash**](../index.md)

---

[@stynx-web/angular-trash](../index.md) / StynxTrashAdapter

# Interface: StynxTrashAdapter

Defined in: [types.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/types.ts#L38)

## Methods

### bulkHardDelete()?

> `optional` **bulkHardDelete**(`resource`, `ids`): `Promise`\<`void`\>

Defined in: [types.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/types.ts#L44)

#### Parameters

##### resource

`string`

##### ids

`string`[]

#### Returns

`Promise`\<`void`\>

---

### bulkRestore()?

> `optional` **bulkRestore**(`resource`, `ids`): `Promise`\<`void`\>

Defined in: [types.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/types.ts#L43)

#### Parameters

##### resource

`string`

##### ids

`string`[]

#### Returns

`Promise`\<`void`\>

---

### hardDelete()?

> `optional` **hardDelete**(`resource`, `id`): `Promise`\<`void`\>

Defined in: [types.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/types.ts#L42)

#### Parameters

##### resource

`string`

##### id

`string`

#### Returns

`Promise`\<`void`\>

---

### list()

> **list**(`resource`, `query`): `Promise`\<[`StynxTrashPage`](StynxTrashPage.md)\>

Defined in: [types.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/types.ts#L39)

#### Parameters

##### resource

`string`

##### query

[`StynxTrashQuery`](StynxTrashQuery.md)

#### Returns

`Promise`\<[`StynxTrashPage`](StynxTrashPage.md)\>

---

### restore()

> **restore**(`resource`, `id`): `Promise`\<`void`\>

Defined in: [types.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/types.ts#L40)

#### Parameters

##### resource

`string`

##### id

`string`

#### Returns

`Promise`\<`void`\>

---

### restoreWithCascade()?

> `optional` **restoreWithCascade**(`resource`, `id`): `Promise`\<`void`\>

Defined in: [types.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/types.ts#L41)

#### Parameters

##### resource

`string`

##### id

`string`

#### Returns

`Promise`\<`void`\>
