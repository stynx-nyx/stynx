[**@stynx-web/angular-auth**](../index.md)

---

[@stynx-web/angular-auth](../index.md) / HttpAuthBackend

# Class: HttpAuthBackend

Defined in: [http-auth.backend.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/http-auth.backend.ts#L13)

## Implements

- [`StynxAuthBackend`](../interfaces/StynxAuthBackend.md)

## Constructors

### Constructor

> **new HttpAuthBackend**(): `HttpAuthBackend`

#### Returns

`HttpAuthBackend`

## Methods

### exchangeCognitoToken()

> **exchangeCognitoToken**(`cognitoToken`, `tenantId`): `Promise`\<[`StynxSessionBundle`](../interfaces/StynxSessionBundle.md)\>

Defined in: [http-auth.backend.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/http-auth.backend.ts#L17)

#### Parameters

##### cognitoToken

`string`

##### tenantId

`string`

#### Returns

`Promise`\<[`StynxSessionBundle`](../interfaces/StynxSessionBundle.md)\>

#### Implementation of

[`StynxAuthBackend`](../interfaces/StynxAuthBackend.md).[`exchangeCognitoToken`](../interfaces/StynxAuthBackend.md#exchangecognitotoken)

---

### logout()

> **logout**(`accessToken`): `Promise`\<`void`\>

Defined in: [http-auth.backend.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/http-auth.backend.ts#L42)

#### Parameters

##### accessToken

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StynxAuthBackend`](../interfaces/StynxAuthBackend.md).[`logout`](../interfaces/StynxAuthBackend.md#logout)

---

### switchTenant()

> **switchTenant**(`accessToken`, `tenantId`): `Promise`\<[`StynxSessionBundle`](../interfaces/StynxSessionBundle.md)\>

Defined in: [http-auth.backend.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/http-auth.backend.ts#L29)

#### Parameters

##### accessToken

`string`

##### tenantId

`string`

#### Returns

`Promise`\<[`StynxSessionBundle`](../interfaces/StynxSessionBundle.md)\>

#### Implementation of

[`StynxAuthBackend`](../interfaces/StynxAuthBackend.md).[`switchTenant`](../interfaces/StynxAuthBackend.md#switchtenant)
