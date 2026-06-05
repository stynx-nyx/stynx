[**@stynx/contracts**](../index.md)

---

[@stynx/contracts](../index.md) / ObjectStorageService

# Interface: ObjectStorageService

Defined in: [packages/contracts/src/storage.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/storage.ts#L27)

## Methods

### delete()?

> `optional` **delete**(`key`): `Promise`\<`void`\>

Defined in: [packages/contracts/src/storage.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/storage.ts#L31)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`void`\>

---

### exists()

> **exists**(`key`): `Promise`\<`boolean`\>

Defined in: [packages/contracts/src/storage.ts:30](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/storage.ts#L30)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`boolean`\>

---

### presignDownload()

> **presignDownload**(`input`): `Promise`\<[`PresignedDownloadResponse`](PresignedDownloadResponse.md)\>

Defined in: [packages/contracts/src/storage.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/storage.ts#L29)

#### Parameters

##### input

[`PresignedDownloadRequest`](PresignedDownloadRequest.md)

#### Returns

`Promise`\<[`PresignedDownloadResponse`](PresignedDownloadResponse.md)\>

---

### presignUpload()

> **presignUpload**(`input`): `Promise`\<[`PresignedUploadResponse`](PresignedUploadResponse.md)\>

Defined in: [packages/contracts/src/storage.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/storage.ts#L28)

#### Parameters

##### input

[`PresignedUploadRequest`](PresignedUploadRequest.md)

#### Returns

`Promise`\<[`PresignedUploadResponse`](PresignedUploadResponse.md)\>
