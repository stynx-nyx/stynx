[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / SessionJwksService

# Class: SessionJwksService

Defined in: [packages-web/sdk/src/generated/services/SessionJwksService.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/SessionJwksService.ts#L8)

## Constructors

### Constructor

> **new SessionJwksService**(`httpRequest`): `SessionJwksService`

Defined in: [packages-web/sdk/src/generated/services/SessionJwksService.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/SessionJwksService.ts#L9)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`SessionJwksService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/SessionJwksService.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/SessionJwksService.ts#L9)

## Methods

### sessionJwksGetWellKnownJwksJsonHandler()

> **sessionJwksGetWellKnownJwksJsonHandler**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| \{ `keys`: `Record`\<`string`, `string`\> & `object`[]; \}\>

Defined in: [packages-web/sdk/src/generated/services/SessionJwksService.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/SessionJwksService.ts#L15)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| \{ `keys`: `Record`\<`string`, `string`\> & `object`[]; \}\>

any OK

#### Throws

ApiError
