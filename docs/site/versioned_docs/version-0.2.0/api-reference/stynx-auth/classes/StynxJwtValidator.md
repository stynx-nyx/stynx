[**@stynx-nyx/auth**](../index.md)

---

[@stynx-nyx/auth](../index.md) / StynxJwtValidator

# Class: StynxJwtValidator

Defined in: [stynx-jwt.validator.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/stynx-jwt.validator.ts#L14)

## Constructors

### Constructor

> **new StynxJwtValidator**(`moduleRef`, `options`): `StynxJwtValidator`

Defined in: [stynx-jwt.validator.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/stynx-jwt.validator.ts#L17)

#### Parameters

##### moduleRef

`ModuleRef`

##### options

[`ResolvedStynxAuthModuleOptions`](../interfaces/ResolvedStynxAuthModuleOptions.md)

#### Returns

`StynxJwtValidator`

## Methods

### validate()

> **validate**(`token`): `Promise`\<[`StynxAccessTokenClaims`](../interfaces/StynxAccessTokenClaims.md)\>

Defined in: [stynx-jwt.validator.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/stynx-jwt.validator.ts#L23)

#### Parameters

##### token

`string`

#### Returns

`Promise`\<[`StynxAccessTokenClaims`](../interfaces/StynxAccessTokenClaims.md)\>
