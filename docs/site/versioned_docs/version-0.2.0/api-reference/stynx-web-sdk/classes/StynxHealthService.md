[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / StynxHealthService

# Class: StynxHealthService

Defined in: [packages-web/sdk/src/generated/services/StynxHealthService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxHealthService.ts#L10)

## Constructors

### Constructor

> **new StynxHealthService**(`httpRequest`): `StynxHealthService`

Defined in: [packages-web/sdk/src/generated/services/StynxHealthService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxHealthService.ts#L11)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`StynxHealthService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/StynxHealthService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxHealthService.ts#L11)

## Methods

### stynxHealthGetHealthzLiveness()

> **stynxHealthGetHealthzLiveness**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxHealthService.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxHealthService.ts#L17)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

JsonObject OK

#### Throws

ApiError

---

### stynxHealthGetInfoInfo()

> **stynxHealthGetInfoInfo**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxHealthService.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxHealthService.ts#L34)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

JsonObject OK

#### Throws

ApiError

---

### stynxHealthGetMetricsHandler()

> **stynxHealthGetMetricsHandler**(): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxHealthService.ts:51](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxHealthService.ts#L51)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### stynxHealthGetReadyzHandler()

> **stynxHealthGetReadyzHandler**(): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxHealthService.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxHealthService.ts#L68)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError
