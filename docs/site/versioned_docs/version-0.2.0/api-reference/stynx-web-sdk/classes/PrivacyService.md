[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / PrivacyService

# Class: PrivacyService

Defined in: [packages-web/sdk/src/generated/services/PrivacyService.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/PrivacyService.ts#L13)

## Constructors

### Constructor

> **new PrivacyService**(`httpRequest`): `PrivacyService`

Defined in: [packages-web/sdk/src/generated/services/PrivacyService.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/PrivacyService.ts#L14)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`PrivacyService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/PrivacyService.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/PrivacyService.ts#L14)

## Methods

### privacyGetPrivacyRetentionApplyRetention()

> **privacyGetPrivacyRetentionApplyRetention**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`PrivacyRetentionResult`](../type-aliases/PrivacyRetentionResult.md)\>

Defined in: [packages-web/sdk/src/generated/services/PrivacyService.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/PrivacyService.ts#L66)

#### Parameters

##### \_\_namedParameters

###### dryRun?

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`PrivacyRetentionResult`](../type-aliases/PrivacyRetentionResult.md)\>

PrivacyRetentionResult OK

#### Throws

ApiError

---

### privacyPostPrivacyErasuresEraseSubject()

> **privacyPostPrivacyErasuresEraseSubject**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`PrivacyErasureResult`](../type-aliases/PrivacyErasureResult.md)\>

Defined in: [packages-web/sdk/src/generated/services/PrivacyService.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/PrivacyService.ts#L20)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`PrivacyErasureRequest`](../type-aliases/PrivacyErasureRequest.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`PrivacyErasureResult`](../type-aliases/PrivacyErasureResult.md)\>

PrivacyErasureResult OK

#### Throws

ApiError

---

### privacyPostPrivacyExportsExportData()

> **privacyPostPrivacyExportsExportData**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`PrivacyExportResult`](../type-aliases/PrivacyExportResult.md)\>

Defined in: [packages-web/sdk/src/generated/services/PrivacyService.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/PrivacyService.ts#L43)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`PrivacyExportRequest`](../type-aliases/PrivacyExportRequest.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`PrivacyExportResult`](../type-aliases/PrivacyExportResult.md)\>

PrivacyExportResult OK

#### Throws

ApiError
