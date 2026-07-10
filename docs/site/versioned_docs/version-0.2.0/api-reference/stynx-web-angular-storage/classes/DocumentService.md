[**@stynx-nyx/angular-storage**](../index.md)

---

[@stynx-nyx/angular-storage](../index.md) / DocumentService

# Class: DocumentService

Defined in: [document.service.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document.service.ts#L24)

## Constructors

### Constructor

> **new DocumentService**(): `DocumentService`

#### Returns

`DocumentService`

## Methods

### complete()

> **complete**(`id`): `Promise`\<[`StynxDocumentCompleteResponse`](../interfaces/StynxDocumentCompleteResponse.md)\>

Defined in: [document.service.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document.service.ts#L34)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`StynxDocumentCompleteResponse`](../interfaces/StynxDocumentCompleteResponse.md)\>

---

### getDownloadUrl()

> **getDownloadUrl**(`id`): `Promise`\<[`StynxDocumentDownloadResponse`](../interfaces/StynxDocumentDownloadResponse.md)\>

Defined in: [document.service.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document.service.ts#L40)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`StynxDocumentDownloadResponse`](../interfaces/StynxDocumentDownloadResponse.md)\>

---

### getSignedUrl()

> **getSignedUrl**(`id`): `Promise`\<[`StynxDocumentDownloadResponse`](../interfaces/StynxDocumentDownloadResponse.md)\>

Defined in: [document.service.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document.service.ts#L46)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`StynxDocumentDownloadResponse`](../interfaces/StynxDocumentDownloadResponse.md)\>

---

### initiate()

> **initiate**(`input`): `Promise`\<[`StynxDocumentUploadInitResponse`](../interfaces/StynxDocumentUploadInitResponse.md)\>

Defined in: [document.service.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document.service.ts#L28)

#### Parameters

##### input

[`StynxDocumentUploadInitRequest`](../interfaces/StynxDocumentUploadInitRequest.md)

#### Returns

`Promise`\<[`StynxDocumentUploadInitResponse`](../interfaces/StynxDocumentUploadInitResponse.md)\>

---

### list()

> **list**(`collection`): `Promise`\<[`StynxDocumentListItem`](../interfaces/StynxDocumentListItem.md)[]\>

Defined in: [document.service.ts:77](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document.service.ts#L77)

#### Parameters

##### collection

`string`

#### Returns

`Promise`\<[`StynxDocumentListItem`](../interfaces/StynxDocumentListItem.md)[]\>

---

### scanStatus$()

> **scanStatus$**(`documentId`, `options?`): `Observable`\<[`StynxDocumentScanEvent`](../interfaces/StynxDocumentScanEvent.md)\>

Defined in: [document.service.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document.service.ts#L50)

#### Parameters

##### documentId

`string`

##### options?

[`StynxDocumentScanStatusOptions`](../interfaces/StynxDocumentScanStatusOptions.md) = `{}`

#### Returns

`Observable`\<[`StynxDocumentScanEvent`](../interfaces/StynxDocumentScanEvent.md)\>
