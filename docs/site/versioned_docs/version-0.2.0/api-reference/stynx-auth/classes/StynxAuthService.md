[**@stynx-nyx/auth**](../index.md)

---

[@stynx-nyx/auth](../index.md) / StynxAuthService

# Class: StynxAuthService

Defined in: [auth.service.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.service.ts#L34)

## Constructors

### Constructor

> **new StynxAuthService**(`moduleRef`, `permissionCache`, `permissionQueries`, `effectiveHashComputer`, `cognitoValidator`): `StynxAuthService`

Defined in: [auth.service.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.service.ts#L35)

#### Parameters

##### moduleRef

`ModuleRef`

##### permissionCache

[`PermissionCache`](PermissionCache.md)

##### permissionQueries

[`PermissionQueryService`](PermissionQueryService.md)

##### effectiveHashComputer

[`EffectiveHashComputer`](EffectiveHashComputer.md)

##### cognitoValidator

[`CognitoJwtValidator`](CognitoJwtValidator.md)

#### Returns

`StynxAuthService`

## Methods

### exchangeCognitoToken()

> **exchangeCognitoToken**(`cognitoToken`, `tenantId`, `deviceMeta?`): `Promise`\<`SessionBundle`\>

Defined in: [auth.service.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.service.ts#L43)

#### Parameters

##### cognitoToken

`string`

##### tenantId

`string`

##### deviceMeta?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`SessionBundle`\>

---

### exchangeExistingIdentity()

> **exchangeExistingIdentity**(`userId`, `cognitoSub`, `tenantId`, `deviceMeta?`): `Promise`\<`SessionBundle`\>

Defined in: [auth.service.ts:101](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.service.ts#L101)

#### Parameters

##### userId

`string`

##### cognitoSub

`string` \| `undefined`

##### tenantId

`string`

##### deviceMeta?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`SessionBundle`\>

---

### inspectPermissions()

> **inspectPermissions**(`sid`): `Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md) \| `null`\>

Defined in: [auth.service.ts:137](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.service.ts#L137)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md) \| `null`\>

---

### invalidatePermissions()

> **invalidatePermissions**(`sid`): `Promise`\<`void`\>

Defined in: [auth.service.ts:141](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.service.ts#L141)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<`void`\>

---

### logout()

> **logout**(`sid`): `Promise`\<`void`\>

Defined in: [auth.service.ts:96](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.service.ts#L96)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<`void`\>

---

### switchTenant()

> **switchTenant**(`actor`, `tenantId`, `deviceMeta?`): `Promise`\<`SessionBundle`\>

Defined in: [auth.service.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.service.ts#L80)

#### Parameters

##### actor

[`SessionActor`](../interfaces/SessionActor.md)

##### tenantId

`string`

##### deviceMeta?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`Promise`\<`SessionBundle`\>
