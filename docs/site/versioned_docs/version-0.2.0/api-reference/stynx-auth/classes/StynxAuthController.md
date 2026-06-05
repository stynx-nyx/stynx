[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / StynxAuthController

# Class: StynxAuthController

Defined in: [auth.controller.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.controller.ts#L32)

## Constructors

### Constructor

> **new StynxAuthController**(`authService`): `StynxAuthController`

Defined in: [auth.controller.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.controller.ts#L33)

#### Parameters

##### authService

[`StynxAuthService`](StynxAuthService.md)

#### Returns

`StynxAuthController`

## Methods

### createSession()

> **createSession**(`body`, `tenantHeader`): `Promise`\<`SessionBundle`\>

Defined in: [auth.controller.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.controller.ts#L38)

#### Parameters

##### body

[`SessionExchangeBody`](../interfaces/SessionExchangeBody.md)

##### tenantHeader

`string` \| `string`[] \| `undefined`

#### Returns

`Promise`\<`SessionBundle`\>

---

### inspect()

> **inspect**(`sid`): `Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md) \| `null`\>

Defined in: [auth.controller.ts:91](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.controller.ts#L91)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md) \| `null`\>

---

### invalidate()

> **invalidate**(`sid`): `Promise`\<\{ `status`: `string`; \}\>

Defined in: [auth.controller.ts:99](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.controller.ts#L99)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<\{ `status`: `string`; \}\>

---

### logout()

> **logout**(`request`): `Promise`\<\{ `status`: `string`; \}\>

Defined in: [auth.controller.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.controller.ts#L80)

#### Parameters

##### request

[`RequestLike`](../interfaces/RequestLike.md)

#### Returns

`Promise`\<\{ `status`: `string`; \}\>

---

### switchSession()

> **switchSession**(`request`, `body`, `tenantHeader`): `Promise`\<`SessionBundle`\>

Defined in: [auth.controller.ts:55](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/auth.controller.ts#L55)

#### Parameters

##### request

[`RequestLike`](../interfaces/RequestLike.md)

##### body

[`SessionSwitchBody`](../interfaces/SessionSwitchBody.md)

##### tenantHeader

`string` \| `string`[] \| `undefined`

#### Returns

`Promise`\<`SessionBundle`\>
