[**@stynx-nyx/privacy**](../index.md)

---

[@stynx-nyx/privacy](../index.md) / PrivacyService

# Class: PrivacyService

Defined in: [packages/privacy/src/privacy.service.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.service.ts#L62)

## Constructors

### Constructor

> **new PrivacyService**(`moduleRef`, `piiMapService`, `objectStore`, `cognitoAdmin`, `options`): `PrivacyService`

Defined in: [packages/privacy/src/privacy.service.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.service.ts#L63)

#### Parameters

##### moduleRef

`ModuleRef`

##### piiMapService

[`PiiMapService`](PiiMapService.md)

##### objectStore

[`PrivacyObjectStore`](../interfaces/PrivacyObjectStore.md)

##### cognitoAdmin

[`PrivacyCognitoAdmin`](../interfaces/PrivacyCognitoAdmin.md)

##### options

[`StynxPrivacyModuleOptions`](../interfaces/StynxPrivacyModuleOptions.md)

#### Returns

`PrivacyService`

## Methods

### applyRetention()

> **applyRetention**(`dryRun?`): `Promise`\<[`PrivacyRetentionResult`](../interfaces/PrivacyRetentionResult.md)\>

Defined in: [packages/privacy/src/privacy.service.ts:178](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.service.ts#L178)

#### Parameters

##### dryRun?

`boolean` = `true`

#### Returns

`Promise`\<[`PrivacyRetentionResult`](../interfaces/PrivacyRetentionResult.md)\>

---

### eraseSubject()

> **eraseSubject**(`input`): `Promise`\<[`PrivacyErasureResult`](../interfaces/PrivacyErasureResult.md)\>

Defined in: [packages/privacy/src/privacy.service.ts:146](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.service.ts#L146)

#### Parameters

##### input

[`PrivacyErasureRequest`](../interfaces/PrivacyErasureRequest.md)

#### Returns

`Promise`\<[`PrivacyErasureResult`](../interfaces/PrivacyErasureResult.md)\>

---

### exportData()

> **exportData**(`input`): `Promise`\<[`PrivacyExportResult`](../interfaces/PrivacyExportResult.md)\>

Defined in: [packages/privacy/src/privacy.service.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.service.ts#L74)

#### Parameters

##### input

[`PrivacyExportRequest`](../interfaces/PrivacyExportRequest.md)

#### Returns

`Promise`\<[`PrivacyExportResult`](../interfaces/PrivacyExportResult.md)\>

---

### generateRopa()

> **generateRopa**(`metadata?`): `Promise`\<`string`\>

Defined in: [packages/privacy/src/privacy.service.ts:229](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.service.ts#L229)

#### Parameters

##### metadata?

[`RopaMetadata`](../interfaces/RopaMetadata.md) = `{}`

#### Returns

`Promise`\<`string`\>
