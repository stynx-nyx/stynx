[**@stynx/storage**](../index.md)

---

[@stynx/storage](../index.md) / StynxObjectStore

# Class: StynxObjectStore

Defined in: [packages/storage/src/object-store.service.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/object-store.service.ts#L23)

## Constructors

### Constructor

> **new StynxObjectStore**(`options`): `StynxObjectStore`

Defined in: [packages/storage/src/object-store.service.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/object-store.service.ts#L26)

#### Parameters

##### options

[`ObjectStoreOptions`](../interfaces/ObjectStoreOptions.md)

#### Returns

`StynxObjectStore`

## Methods

### presignDownload()

> **presignDownload**(`input`): `Promise`\<`string`\>

Defined in: [packages/storage/src/object-store.service.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/object-store.service.ts#L48)

#### Parameters

##### input

[`PresignObjectDownloadInput`](../interfaces/PresignObjectDownloadInput.md)

#### Returns

`Promise`\<`string`\>

---

### putObject()

> **putObject**(`input`): `Promise`\<`void`\>

Defined in: [packages/storage/src/object-store.service.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/object-store.service.ts#L36)

#### Parameters

##### input

[`PutObjectInput`](../interfaces/PutObjectInput.md)

#### Returns

`Promise`\<`void`\>
