[**@stynx/storage**](../index.md)

---

[@stynx/storage](../index.md) / DocumentsService

# Class: DocumentsService

Defined in: [packages/storage/src/documents.service.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/documents.service.ts#L47)

## Constructors

### Constructor

> **new DocumentsService**(`moduleRef`, `requestContext`, `s3`, `options`): `DocumentsService`

Defined in: [packages/storage/src/documents.service.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/documents.service.ts#L48)

#### Parameters

##### moduleRef

`ModuleRef`

##### requestContext

`RequestContext`

##### s3

[`S3Service`](S3Service.md)

##### options

[`StynxStorageModuleOptions`](../interfaces/StynxStorageModuleOptions.md)

#### Returns

`DocumentsService`

## Methods

### complete()

> **complete**(`id`, `headers?`): `Promise`\<[`CompleteDocumentResult`](../interfaces/CompleteDocumentResult.md)\>

Defined in: [packages/storage/src/documents.service.ts:118](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/documents.service.ts#L118)

#### Parameters

##### id

`string`

##### headers?

[`CompleteDocumentHeaders`](../interfaces/CompleteDocumentHeaders.md) = `{}`

#### Returns

`Promise`\<[`CompleteDocumentResult`](../interfaces/CompleteDocumentResult.md)\>

---

### getDownloadUrl()

> **getDownloadUrl**(`id`): `Promise`\<[`DownloadDocumentResult`](../interfaces/DownloadDocumentResult.md)\>

Defined in: [packages/storage/src/documents.service.ts:171](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/documents.service.ts#L171)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`DownloadDocumentResult`](../interfaces/DownloadDocumentResult.md)\>

---

### hardRemove()

> **hardRemove**(`id`): `Promise`\<`void`\>

Defined in: [packages/storage/src/documents.service.ts:200](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/documents.service.ts#L200)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

---

### initiate()

> **initiate**(`input`): `Promise`\<[`InitiateDocumentResult`](../interfaces/InitiateDocumentResult.md)\>

Defined in: [packages/storage/src/documents.service.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/documents.service.ts#L56)

#### Parameters

##### input

[`InitiateDocumentInput`](../interfaces/InitiateDocumentInput.md)

#### Returns

`Promise`\<[`InitiateDocumentResult`](../interfaces/InitiateDocumentResult.md)\>

---

### restore()

> **restore**(`id`): `Promise`\<`void`\>

Defined in: [packages/storage/src/documents.service.ts:192](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/documents.service.ts#L192)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

---

### softRemove()

> **softRemove**(`id`): `Promise`\<`void`\>

Defined in: [packages/storage/src/documents.service.ts:184](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/documents.service.ts#L184)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>
