[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / TenancyService

# Class: TenancyService

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L17)

## Constructors

### Constructor

> **new TenancyService**(`httpRequest`): `TenancyService`

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L18)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`TenancyService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L18)

## Methods

### tenancyGetTenantsByIdGet()

> **tenancyGetTenantsByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`TenantDetail`](../type-aliases/TenantDetail.md)\>

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:64](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L64)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`TenantDetail`](../type-aliases/TenantDetail.md)\>

TenantDetail OK

#### Throws

ApiError

---

### tenancyGetTenantsList()

> **tenancyGetTenantsList**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`TenantSummary`](../type-aliases/TenantSummary.md)[]\>

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L24)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`TenantSummary`](../type-aliases/TenantSummary.md)[]\>

TenantSummary OK

#### Throws

ApiError

---

### tenancyPatchTenantsByIdUpdate()

> **tenancyPatchTenantsByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`TenantDetail`](../type-aliases/TenantDetail.md)\>

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L88)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateTenantInput`](../type-aliases/UpdateTenantInput.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`TenantDetail`](../type-aliases/TenantDetail.md)\>

TenantDetail OK

#### Throws

ApiError

---

### tenancyPostTenantsByIdArchiveArchive()

> **tenancyPostTenantsByIdArchiveArchive**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`ArchiveTenantResult`](../type-aliases/ArchiveTenantResult.md)\>

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:116](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L116)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`ArchiveTenantResult`](../type-aliases/ArchiveTenantResult.md)\>

ArchiveTenantResult OK

#### Throws

ApiError

---

### tenancyPostTenantsByIdPurgePurge()

> **tenancyPostTenantsByIdPurgePurge**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`PurgeTenantResult`](../type-aliases/PurgeTenantResult.md)\>

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:140](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L140)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`PurgeTenantResult`](../type-aliases/PurgeTenantResult.md)\>

PurgeTenantResult OK

#### Throws

ApiError

---

### tenancyPostTenantsByIdSuspendSuspend()

> **tenancyPostTenantsByIdSuspendSuspend**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`SuspendTenantResult`](../type-aliases/SuspendTenantResult.md)\>

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:164](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L164)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`SuspendTenantInput`](../type-aliases/SuspendTenantInput.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`SuspendTenantResult`](../type-aliases/SuspendTenantResult.md)\>

SuspendTenantResult OK

#### Throws

ApiError

---

### tenancyPostTenantsCreate()

> **tenancyPostTenantsCreate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`ProvisionTenantResult`](../type-aliases/ProvisionTenantResult.md)\>

Defined in: [packages-web/sdk/src/generated/services/TenancyService.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/TenancyService.ts#L41)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`ProvisionTenantInput`](../type-aliases/ProvisionTenantInput.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`ProvisionTenantResult`](../type-aliases/ProvisionTenantResult.md)\>

ProvisionTenantResult OK

#### Throws

ApiError
