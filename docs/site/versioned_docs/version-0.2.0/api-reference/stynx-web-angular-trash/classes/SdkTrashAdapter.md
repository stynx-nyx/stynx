[**@stynx-web/angular-trash**](../index.md)

---

[@stynx-web/angular-trash](../index.md) / SdkTrashAdapter

# Class: SdkTrashAdapter

Defined in: [sdk-trash.adapter.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/sdk-trash.adapter.ts#L42)

## Implements

- [`StynxTrashAdapter`](../interfaces/StynxTrashAdapter.md)

## Constructors

### Constructor

> **new SdkTrashAdapter**(): `SdkTrashAdapter`

#### Returns

`SdkTrashAdapter`

## Methods

### bulkHardDelete()

> **bulkHardDelete**(`resource`, `ids`): `Promise`\<`void`\>

Defined in: [sdk-trash.adapter.ts:91](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/sdk-trash.adapter.ts#L91)

#### Parameters

##### resource

`string`

##### ids

`string`[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StynxTrashAdapter`](../interfaces/StynxTrashAdapter.md).[`bulkHardDelete`](../interfaces/StynxTrashAdapter.md#bulkharddelete)

---

### bulkRestore()

> **bulkRestore**(`resource`, `ids`): `Promise`\<`void`\>

Defined in: [sdk-trash.adapter.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/sdk-trash.adapter.ts#L87)

#### Parameters

##### resource

`string`

##### ids

`string`[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StynxTrashAdapter`](../interfaces/StynxTrashAdapter.md).[`bulkRestore`](../interfaces/StynxTrashAdapter.md#bulkrestore)

---

### hardDelete()

> **hardDelete**(`resource`, `id`): `Promise`\<`void`\>

Defined in: [sdk-trash.adapter.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/sdk-trash.adapter.ts#L83)

#### Parameters

##### resource

`string`

##### id

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StynxTrashAdapter`](../interfaces/StynxTrashAdapter.md).[`hardDelete`](../interfaces/StynxTrashAdapter.md#harddelete)

---

### list()

> **list**(`resource`, `query`): `Promise`\<[`StynxTrashPage`](../interfaces/StynxTrashPage.md)\>

Defined in: [sdk-trash.adapter.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/sdk-trash.adapter.ts#L46)

#### Parameters

##### resource

`string`

##### query

[`StynxTrashQuery`](../interfaces/StynxTrashQuery.md)

#### Returns

`Promise`\<[`StynxTrashPage`](../interfaces/StynxTrashPage.md)\>

#### Implementation of

[`StynxTrashAdapter`](../interfaces/StynxTrashAdapter.md).[`list`](../interfaces/StynxTrashAdapter.md#list)

---

### restore()

> **restore**(`resource`, `id`): `Promise`\<`void`\>

Defined in: [sdk-trash.adapter.ts:75](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/sdk-trash.adapter.ts#L75)

#### Parameters

##### resource

`string`

##### id

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StynxTrashAdapter`](../interfaces/StynxTrashAdapter.md).[`restore`](../interfaces/StynxTrashAdapter.md#restore)

---

### restoreWithCascade()

> **restoreWithCascade**(`resource`, `id`): `Promise`\<`void`\>

Defined in: [sdk-trash.adapter.ts:79](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/sdk-trash.adapter.ts#L79)

#### Parameters

##### resource

`string`

##### id

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StynxTrashAdapter`](../interfaces/StynxTrashAdapter.md).[`restoreWithCascade`](../interfaces/StynxTrashAdapter.md#restorewithcascade)
