[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / CognitoJwtValidator

# Class: CognitoJwtValidator

Defined in: [cognito-jwt.validator.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-jwt.validator.ts#L11)

## Constructors

### Constructor

> **new CognitoJwtValidator**(`authOptions`): `CognitoJwtValidator`

Defined in: [cognito-jwt.validator.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-jwt.validator.ts#L12)

#### Parameters

##### authOptions

[`ResolvedStynxAuthModuleOptions`](../interfaces/ResolvedStynxAuthModuleOptions.md)

#### Returns

`CognitoJwtValidator`

## Methods

### validateAccessToken()

> **validateAccessToken**(`token`): `Promise`\<[`CognitoAccessTokenClaims`](../interfaces/CognitoAccessTokenClaims.md)\>

Defined in: [cognito-jwt.validator.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-jwt.validator.ts#L17)

#### Parameters

##### token

`string`

#### Returns

`Promise`\<[`CognitoAccessTokenClaims`](../interfaces/CognitoAccessTokenClaims.md)\>

---

### validateAuthorizationHeader()

> **validateAuthorizationHeader**(`value`): `Promise`\<[`CognitoAccessTokenClaims`](../interfaces/CognitoAccessTokenClaims.md)\>

Defined in: [cognito-jwt.validator.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-jwt.validator.ts#L50)

#### Parameters

##### value

`string` \| `string`[] \| `undefined`

#### Returns

`Promise`\<[`CognitoAccessTokenClaims`](../interfaces/CognitoAccessTokenClaims.md)\>
