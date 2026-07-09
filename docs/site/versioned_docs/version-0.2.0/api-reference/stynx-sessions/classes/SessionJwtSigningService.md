[**@stynx-nyx/sessions**](../index.md)

---

[@stynx-nyx/sessions](../index.md) / SessionJwtSigningService

# Class: SessionJwtSigningService

Defined in: [packages/sessions/src/jwt-signing.service.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/jwt-signing.service.ts#L82)

## Constructors

### Constructor

> **new SessionJwtSigningService**(`options`, `secretLoader?`): `SessionJwtSigningService`

Defined in: [packages/sessions/src/jwt-signing.service.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/jwt-signing.service.ts#L85)

#### Parameters

##### options

[`ResolvedStynxSessionsModuleOptions`](../interfaces/ResolvedStynxSessionsModuleOptions.md)

##### secretLoader?

`SecretLoader`

#### Returns

`SessionJwtSigningService`

## Methods

### getJwks()

> **getJwks**(): `Promise`\<\{ `keys`: `Record`\<`string`, `string` \| `undefined`\> & `object`[]; \}\>

Defined in: [packages/sessions/src/jwt-signing.service.ts:131](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/jwt-signing.service.ts#L131)

#### Returns

`Promise`\<\{ `keys`: `Record`\<`string`, `string` \| `undefined`\> & `object`[]; \}\>

---

### signAccessToken()

> **signAccessToken**(`record`, `issuedAt`): `Promise`\<[`IssuedAccessToken`](../interfaces/IssuedAccessToken.md)\>

Defined in: [packages/sessions/src/jwt-signing.service.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/jwt-signing.service.ts#L92)

#### Parameters

##### record

[`SessionRecord`](../interfaces/SessionRecord.md)

##### issuedAt

`Date`

#### Returns

`Promise`\<[`IssuedAccessToken`](../interfaces/IssuedAccessToken.md)\>
