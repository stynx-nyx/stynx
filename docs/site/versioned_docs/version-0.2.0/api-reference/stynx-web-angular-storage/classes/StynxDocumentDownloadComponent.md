[**@stynx-web/angular-storage**](../index.md)

---

[@stynx-web/angular-storage](../index.md) / StynxDocumentDownloadComponent

# Class: StynxDocumentDownloadComponent

Defined in: [document-download.component.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L68)

## Constructors

### Constructor

> **new StynxDocumentDownloadComponent**(): `StynxDocumentDownloadComponent`

#### Returns

`StynxDocumentDownloadComponent`

## Properties

### buttonLabel

> **buttonLabel**: `string` = `'Download document'`

Defined in: [document-download.component.ts:73](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L73)

---

### documentId

> **documentId**: `string` = `''`

Defined in: [document-download.component.ts:71](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L71)

---

### downloadComplete

> `readonly` **downloadComplete**: `EventEmitter`\<[`StynxDocumentDownloadCompletedEvent`](../interfaces/StynxDocumentDownloadCompletedEvent.md)\>

Defined in: [document-download.component.ts:75](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L75)

---

### downloadProgress

> `readonly` **downloadProgress**: `EventEmitter`\<[`StynxDocumentDownloadProgressEvent`](../interfaces/StynxDocumentDownloadProgressEvent.md)\>

Defined in: [document-download.component.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L74)

---

### errorMessage

> `readonly` **errorMessage**: `WritableSignal`\<`string`\>

Defined in: [document-download.component.ts:81](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L81)

---

### filename

> **filename**: `string` = `''`

Defined in: [document-download.component.ts:72](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L72)

---

### isBusy

> `readonly` **isBusy**: `Signal`\<`boolean`\>

Defined in: [document-download.component.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L82)

---

### loadedBytes

> `readonly` **loadedBytes**: `WritableSignal`\<`number`\>

Defined in: [document-download.component.ts:79](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L79)

---

### progressValue

> `readonly` **progressValue**: `WritableSignal`\<`number`\>

Defined in: [document-download.component.ts:78](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L78)

---

### status

> `readonly` **status**: `WritableSignal`\<[`StynxDocumentDownloadStatus`](../type-aliases/StynxDocumentDownloadStatus.md)\>

Defined in: [document-download.component.ts:77](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L77)

---

### statusLabel

> `readonly` **statusLabel**: `Signal`\<`"Preparing download"` \| `"Downloading document"`\>

Defined in: [document-download.component.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L83)

---

### totalBytes

> `readonly` **totalBytes**: `WritableSignal`\<`number` \| `null`\>

Defined in: [document-download.component.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L80)

## Methods

### download()

> **download**(): `Promise`\<`void`\>

Defined in: [document-download.component.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-download.component.ts#L85)

#### Returns

`Promise`\<`void`\>
