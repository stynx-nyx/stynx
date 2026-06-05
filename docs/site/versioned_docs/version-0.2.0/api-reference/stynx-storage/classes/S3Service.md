[**@stynx/storage**](../index.md)

---

[@stynx/storage](../index.md) / S3Service

# Class: S3Service

Defined in: [packages/storage/src/s3.service.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L26)

## Constructors

### Constructor

> **new S3Service**(`options`): `S3Service`

Defined in: [packages/storage/src/s3.service.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L33)

#### Parameters

##### options

[`StynxStorageModuleOptions`](../interfaces/StynxStorageModuleOptions.md)

#### Returns

`S3Service`

## Methods

### applyObjectLock()

> **applyObjectLock**(`key`, `versionId`, `config`): `Promise`\<`void`\>

Defined in: [packages/storage/src/s3.service.ts:142](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L142)

#### Parameters

##### key

`string`

##### versionId

`string`

##### config

[`S3ObjectLockConfig`](../interfaces/S3ObjectLockConfig.md)

#### Returns

`Promise`\<`void`\>

---

### bucket()

> **bucket**(): `string`

Defined in: [packages/storage/src/s3.service.ts:57](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L57)

#### Returns

`string`

---

### configureLifecycle()

> **configureLifecycle**(`rules`): `Promise`\<`void`\>

Defined in: [packages/storage/src/s3.service.ts:118](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L118)

#### Parameters

##### rules

[`S3LifecycleRule`](../interfaces/S3LifecycleRule.md)[]

#### Returns

`Promise`\<`void`\>

---

### deleteAllVersions()

> **deleteAllVersions**(`key`): `Promise`\<`void`\>

Defined in: [packages/storage/src/s3.service.ts:186](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L186)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`void`\>

---

### deleteObject()

> **deleteObject**(`key`): `Promise`\<`void`\>

Defined in: [packages/storage/src/s3.service.ts:177](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L177)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`void`\>

---

### headObject()

> **headObject**(`key`): `Promise`\<[`HeadedObject`](../interfaces/HeadedObject.md)\>

Defined in: [packages/storage/src/s3.service.ts:162](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L162)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`HeadedObject`](../interfaces/HeadedObject.md)\>

---

### presignDownload()

> **presignDownload**(`input`): `Promise`\<\{ `expiresInSeconds`: `number`; `url`: `string`; \}\>

Defined in: [packages/storage/src/s3.service.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L92)

#### Parameters

##### input

###### expiresInSeconds?

`number`

###### filename

`string`

###### key

`string`

#### Returns

`Promise`\<\{ `expiresInSeconds`: `number`; `url`: `string`; \}\>

---

### presignDownloadForTenant()

> **presignDownloadForTenant**(`input`): `Promise`\<`string`\>

Defined in: [packages/storage/src/s3.service.ts:103](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L103)

#### Parameters

##### input

###### expiresInSeconds?

`number`

###### key

`string`

###### tenantId

`string`

#### Returns

`Promise`\<`string`\>

---

### presignUpload()

> **presignUpload**(`input`): `Promise`\<\{ `expiresInSeconds`: `number`; `headers`: \{ `content-type`: `string`; `x-amz-meta-sha256`: `string`; `x-amz-server-side-encryption`: `string`; `x-amz-server-side-encryption-aws-kms-key-id`: `string`; \}; `method`: `"PUT"`; `url`: `string`; \}\>

Defined in: [packages/storage/src/s3.service.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/s3.service.ts#L61)

#### Parameters

##### input

###### checksumSha256

`string`

###### contentType

`string`

###### expiresInSeconds?

`number`

###### key

`string`

#### Returns

`Promise`\<\{ `expiresInSeconds`: `number`; `headers`: \{ `content-type`: `string`; `x-amz-meta-sha256`: `string`; `x-amz-server-side-encryption`: `string`; `x-amz-server-side-encryption-aws-kms-key-id`: `string`; \}; `method`: `"PUT"`; `url`: `string`; \}\>
