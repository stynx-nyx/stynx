[**@stynx-nyx/privacy**](../index.md)

---

[@stynx-nyx/privacy](../index.md) / PrivacyObjectStoreService

# Class: PrivacyObjectStoreService

Defined in: [packages/privacy/src/privacy-object-store.service.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy-object-store.service.ts#L7)

## Implements

- [`PrivacyObjectStore`](../interfaces/PrivacyObjectStore.md)

## Constructors

### Constructor

> **new PrivacyObjectStoreService**(`options`): `PrivacyObjectStoreService`

Defined in: [packages/privacy/src/privacy-object-store.service.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy-object-store.service.ts#L10)

#### Parameters

##### options

[`StynxPrivacyModuleOptions`](../interfaces/StynxPrivacyModuleOptions.md)

#### Returns

`PrivacyObjectStoreService`

## Methods

### presignDownload()

> **presignDownload**(`input`): `Promise`\<`string`\>

Defined in: [packages/privacy/src/privacy-object-store.service.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy-object-store.service.ts#L31)

#### Parameters

##### input

###### expiresInSeconds

`number`

###### key

`string`

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`PrivacyObjectStore`](../interfaces/PrivacyObjectStore.md).[`presignDownload`](../interfaces/PrivacyObjectStore.md#presigndownload)

---

### putObject()

> **putObject**(`input`): `Promise`\<`void`\>

Defined in: [packages/privacy/src/privacy-object-store.service.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy-object-store.service.ts#L22)

#### Parameters

##### input

###### body

`Buffer`

###### contentType

`string`

###### expiresAt?

`Date`

###### key

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PrivacyObjectStore`](../interfaces/PrivacyObjectStore.md).[`putObject`](../interfaces/PrivacyObjectStore.md#putobject)
