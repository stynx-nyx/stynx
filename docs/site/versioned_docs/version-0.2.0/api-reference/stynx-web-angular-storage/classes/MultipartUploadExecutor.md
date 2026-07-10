[**@stynx-nyx/angular-storage**](../index.md)

---

[@stynx-nyx/angular-storage](../index.md) / MultipartUploadExecutor

# Class: MultipartUploadExecutor

Defined in: [multipart-upload.executor.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/multipart-upload.executor.ts#L36)

## Implements

- [`StynxUploadExecutor`](../interfaces/StynxUploadExecutor.md)

## Constructors

### Constructor

> **new MultipartUploadExecutor**(): `MultipartUploadExecutor`

#### Returns

`MultipartUploadExecutor`

## Methods

### upload()

> **upload**(`url`, `file`, `headers`, `onProgress`): `Promise`\<`void`\>

Defined in: [multipart-upload.executor.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/multipart-upload.executor.ts#L41)

#### Parameters

##### url

`string`

##### file

`File`

##### headers

`Record`\<`string`, `string`\>

##### onProgress

(`value`) => `void`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StynxUploadExecutor`](../interfaces/StynxUploadExecutor.md).[`upload`](../interfaces/StynxUploadExecutor.md#upload)
