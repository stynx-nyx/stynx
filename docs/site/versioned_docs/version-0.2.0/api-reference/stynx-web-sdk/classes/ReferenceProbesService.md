[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / ReferenceProbesService

# Class: ReferenceProbesService

Defined in: [packages-web/sdk/src/generated/services/ReferenceProbesService.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceProbesService.ts#L9)

## Constructors

### Constructor

> **new ReferenceProbesService**(`httpRequest`): `ReferenceProbesService`

Defined in: [packages-web/sdk/src/generated/services/ReferenceProbesService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceProbesService.ts#L10)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`ReferenceProbesService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/ReferenceProbesService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceProbesService.ts#L10)

## Methods

### referenceProbesGetProbesDataTxHandler()

> **referenceProbesGetProbesDataTxHandler**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/ReferenceProbesService.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceProbesService.ts#L16)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

JsonObject OK

#### Throws

ApiError

---

### referenceProbesGetProbesRatelimitHandler()

> **referenceProbesGetProbesRatelimitHandler**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/ReferenceProbesService.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceProbesService.ts#L50)

#### Parameters

##### \_\_namedParameters

###### warm?

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

JsonObject OK

#### Throws

ApiError

---

### referenceProbesGetProbesReadonlyWriteHandler()

> **referenceProbesGetProbesReadonlyWriteHandler**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/ReferenceProbesService.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceProbesService.ts#L74)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

JsonObject OK

#### Throws

ApiError

---

### referenceProbesPostProbesIdempotencyIdempotency()

> **referenceProbesPostProbesIdempotencyIdempotency**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/ReferenceProbesService.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceProbesService.ts#L33)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

JsonObject OK

#### Throws

ApiError
