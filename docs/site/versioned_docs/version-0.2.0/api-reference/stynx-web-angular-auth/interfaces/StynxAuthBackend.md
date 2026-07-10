[**@stynx-nyx/angular-auth**](../index.md)

---

[@stynx-nyx/angular-auth](../index.md) / StynxAuthBackend

# Interface: StynxAuthBackend

Defined in: [types.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L85)

## Methods

### exchangeCognitoToken()

> **exchangeCognitoToken**(`cognitoToken`, `tenantId`): `Promise`\<[`StynxSessionBundle`](StynxSessionBundle.md)\>

Defined in: [types.ts:86](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L86)

#### Parameters

##### cognitoToken

`string`

##### tenantId

`string`

#### Returns

`Promise`\<[`StynxSessionBundle`](StynxSessionBundle.md)\>

---

### logout()

> **logout**(`accessToken`): `Promise`\<`void`\>

Defined in: [types.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L88)

#### Parameters

##### accessToken

`string`

#### Returns

`Promise`\<`void`\>

---

### switchTenant()

> **switchTenant**(`accessToken`, `tenantId`): `Promise`\<[`StynxSessionBundle`](StynxSessionBundle.md)\>

Defined in: [types.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L87)

#### Parameters

##### accessToken

`string`

##### tenantId

`string`

#### Returns

`Promise`\<[`StynxSessionBundle`](StynxSessionBundle.md)\>
