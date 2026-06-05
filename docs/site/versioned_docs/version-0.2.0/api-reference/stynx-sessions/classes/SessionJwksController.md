[**@stynx/sessions**](../index.md)

---

[@stynx/sessions](../index.md) / SessionJwksController

# Class: SessionJwksController

Defined in: [packages/sessions/src/jwks.controller.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/jwks.controller.ts#L5)

## Constructors

### Constructor

> **new SessionJwksController**(`signingService`): `SessionJwksController`

Defined in: [packages/sessions/src/jwks.controller.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/jwks.controller.ts#L6)

#### Parameters

##### signingService

[`SessionJwtSigningService`](SessionJwtSigningService.md)

#### Returns

`SessionJwksController`

## Methods

### jwks()

> **jwks**(): `Promise`\<\{ `keys`: `Record`\<`string`, `string` \| `undefined`\> & `object`[]; \}\>

Defined in: [packages/sessions/src/jwks.controller.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/jwks.controller.ts#L9)

#### Returns

`Promise`\<\{ `keys`: `Record`\<`string`, `string` \| `undefined`\> & `object`[]; \}\>
