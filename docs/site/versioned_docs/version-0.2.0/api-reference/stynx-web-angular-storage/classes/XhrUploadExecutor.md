[**@stynx-web/angular-storage**](../index.md)

---

[@stynx-web/angular-storage](../index.md) / XhrUploadExecutor

# Class: XhrUploadExecutor

Defined in: [xhr-upload.executor.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/xhr-upload.executor.ts#L5)

## Implements

- [`StynxUploadExecutor`](../interfaces/StynxUploadExecutor.md)

## Constructors

### Constructor

> **new XhrUploadExecutor**(): `XhrUploadExecutor`

#### Returns

`XhrUploadExecutor`

## Methods

### upload()

> **upload**(`url`, `file`, `headers`, `onProgress`): `Promise`\<`void`\>

Defined in: [xhr-upload.executor.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-storage/src/xhr-upload.executor.ts#L6)

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
