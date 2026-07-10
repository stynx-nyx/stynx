[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / StynxAuthService

# Class: StynxAuthService

Defined in: [packages-web/sdk/src/generated/services/StynxAuthService.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuthService.ts#L13)

## Constructors

### Constructor

> **new StynxAuthService**(`httpRequest`): `StynxAuthService`

Defined in: [packages-web/sdk/src/generated/services/StynxAuthService.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuthService.ts#L14)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`StynxAuthService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/StynxAuthService.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuthService.ts#L14)

## Methods

### stynxAuthGetPlatformPermsBySidInspect()

> **stynxAuthGetPlatformPermsBySidInspect**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxAuthService.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuthService.ts#L20)

#### Parameters

##### \_\_namedParameters

###### sid

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### stynxAuthPostPlatformPermsBySidInvalidateHandler()

> **stynxAuthPostPlatformPermsBySidInvalidateHandler**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxAuthService.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuthService.ts#L44)

#### Parameters

##### \_\_namedParameters

###### sid

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

JsonObject OK

#### Throws

ApiError

---

### stynxAuthPostSessionsHandler()

> **stynxAuthPostSessionsHandler**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`SessionBundle`](../type-aliases/SessionBundle.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxAuthService.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuthService.ts#L68)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`SessionExchangeBody`](../type-aliases/SessionExchangeBody.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`SessionBundle`](../type-aliases/SessionBundle.md)\>

SessionBundle OK

#### Throws

ApiError

---

### stynxAuthPostSessionsLogoutHandler()

> **stynxAuthPostSessionsLogoutHandler**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxAuthService.ts:91](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuthService.ts#L91)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`JsonObject`](../type-aliases/JsonObject.md)\>

JsonObject OK

#### Throws

ApiError

---

### stynxAuthPostSessionsSwitchHandler()

> **stynxAuthPostSessionsSwitchHandler**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`SessionBundle`](../type-aliases/SessionBundle.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxAuthService.ts:108](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuthService.ts#L108)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`SessionSwitchBody`](../type-aliases/SessionSwitchBody.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`SessionBundle`](../type-aliases/SessionBundle.md)\>

SessionBundle OK

#### Throws

ApiError
