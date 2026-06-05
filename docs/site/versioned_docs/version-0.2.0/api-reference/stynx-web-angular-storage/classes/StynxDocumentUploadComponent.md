[**@stynx-web/angular-storage**](../index.md)

---

[@stynx-web/angular-storage](../index.md) / StynxDocumentUploadComponent

# Class: StynxDocumentUploadComponent

Defined in: [document-upload.component.ts:95](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L95)

## Implements

- `OnDestroy`

## Constructors

### Constructor

> **new StynxDocumentUploadComponent**(): `StynxDocumentUploadComponent`

#### Returns

`StynxDocumentUploadComponent`

## Properties

### allowedMimes

> **allowedMimes**: `string`[] = `[]`

Defined in: [document-upload.component.ts:103](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L103)

---

### collection

> **collection**: `string` = `''`

Defined in: [document-upload.component.ts:102](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L102)

---

### completed

> `readonly` **completed**: `EventEmitter`\<[`StynxDocumentUploadCompletedEvent`](../interfaces/StynxDocumentUploadCompletedEvent.md)\>

Defined in: [document-upload.component.ts:106](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L106)

---

### enableDragAndDrop

> **enableDragAndDrop**: `boolean` = `false`

Defined in: [document-upload.component.ts:105](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L105)

---

### errorMessage

> **errorMessage**: `string` = `''`

Defined in: [document-upload.component.ts:111](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L111)

---

### isDragActive

> **isDragActive**: `boolean` = `false`

Defined in: [document-upload.component.ts:113](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L113)

---

### maxBytes

> **maxBytes**: `number` = `Number.POSITIVE_INFINITY`

Defined in: [document-upload.component.ts:104](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L104)

---

### progress

> **progress**: `number` = `0`

Defined in: [document-upload.component.ts:110](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L110)

---

### scanStatus

> **scanStatus**: `""` \| [`StynxDocumentScanStatus`](../type-aliases/StynxDocumentScanStatus.md) = `''`

Defined in: [document-upload.component.ts:112](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L112)

---

### scanStatusChanged

> `readonly` **scanStatusChanged**: `EventEmitter`\<[`StynxDocumentScanEvent`](../interfaces/StynxDocumentScanEvent.md)\>

Defined in: [document-upload.component.ts:107](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L107)

---

### status

> **status**: `"completed"` \| `"idle"` \| `"errored"` \| `"initiating"` \| `"uploading"` = `'idle'`

Defined in: [document-upload.component.ts:109](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L109)

## Accessors

### acceptAttribute

#### Get Signature

> **get** **acceptAttribute**(): `string` \| `null`

Defined in: [document-upload.component.ts:119](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L119)

##### Returns

`string` \| `null`

---

### statusLabel

#### Get Signature

> **get** **statusLabel**(): `string`

Defined in: [document-upload.component.ts:115](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L115)

##### Returns

`string`

## Methods

### ngOnDestroy()

> **ngOnDestroy**(): `void`

Defined in: [document-upload.component.ts:218](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L218)

A callback method that performs custom clean-up, invoked immediately
before a directive, pipe, or service instance is destroyed.

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

---

### onDragLeave()

> **onDragLeave**(`event`): `void`

Defined in: [document-upload.component.ts:143](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L143)

#### Parameters

##### event

`DragEvent`

#### Returns

`void`

---

### onDragOver()

> **onDragOver**(`event`): `void`

Defined in: [document-upload.component.ts:131](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L131)

#### Parameters

##### event

`DragEvent`

#### Returns

`void`

---

### onDrop()

> **onDrop**(`event`): `Promise`\<`void`\>

Defined in: [document-upload.component.ts:152](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L152)

#### Parameters

##### event

`DragEvent`

#### Returns

`Promise`\<`void`\>

---

### onFileSelected()

> **onFileSelected**(`event`): `Promise`\<`void`\>

Defined in: [document-upload.component.ts:123](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L123)

#### Parameters

##### event

`Event`

#### Returns

`Promise`\<`void`\>

---

### upload()

> **upload**(`file`): `Promise`\<`void`\>

Defined in: [document-upload.component.ts:166](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/document-upload.component.ts#L166)

#### Parameters

##### file

`File`

#### Returns

`Promise`\<`void`\>
