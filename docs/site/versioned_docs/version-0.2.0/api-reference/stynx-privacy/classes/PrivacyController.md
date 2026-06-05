[**@stynx/privacy**](../index.md)

---

[@stynx/privacy](../index.md) / PrivacyController

# Class: PrivacyController

Defined in: [packages/privacy/src/privacy.controller.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.controller.ts#L7)

## Constructors

### Constructor

> **new PrivacyController**(`privacyService`): `PrivacyController`

Defined in: [packages/privacy/src/privacy.controller.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.controller.ts#L8)

#### Parameters

##### privacyService

[`PrivacyService`](PrivacyService.md)

#### Returns

`PrivacyController`

## Methods

### applyRetention()

> **applyRetention**(`dryRun?`): `Promise`\<[`PrivacyRetentionResult`](../interfaces/PrivacyRetentionResult.md)\>

Defined in: [packages/privacy/src/privacy.controller.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.controller.ts#L23)

#### Parameters

##### dryRun?

`string`

#### Returns

`Promise`\<[`PrivacyRetentionResult`](../interfaces/PrivacyRetentionResult.md)\>

---

### eraseSubject()

> **eraseSubject**(`input`): `Promise`\<[`PrivacyErasureResult`](../interfaces/PrivacyErasureResult.md)\>

Defined in: [packages/privacy/src/privacy.controller.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.controller.ts#L18)

#### Parameters

##### input

[`PrivacyErasureRequest`](../interfaces/PrivacyErasureRequest.md)

#### Returns

`Promise`\<[`PrivacyErasureResult`](../interfaces/PrivacyErasureResult.md)\>

---

### exportData()

> **exportData**(`input`): `Promise`\<[`PrivacyExportResult`](../interfaces/PrivacyExportResult.md)\>

Defined in: [packages/privacy/src/privacy.controller.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/privacy.controller.ts#L12)

#### Parameters

##### input

[`PrivacyExportRequest`](../interfaces/PrivacyExportRequest.md)

#### Returns

`Promise`\<[`PrivacyExportResult`](../interfaces/PrivacyExportResult.md)\>
