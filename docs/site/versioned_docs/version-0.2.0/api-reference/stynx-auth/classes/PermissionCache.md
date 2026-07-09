[**@stynx-nyx/auth**](../index.md)

---

[@stynx-nyx/auth](../index.md) / PermissionCache

# Class: PermissionCache

Defined in: [permission-cache.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache.ts#L68)

## Implements

- `OnModuleInit`
- `OnModuleDestroy`

## Constructors

### Constructor

> **new PermissionCache**(`options`, `backend`, `queries`, `metrics`): `PermissionCache`

Defined in: [permission-cache.ts:73](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache.ts#L73)

#### Parameters

##### options

[`ResolvedStynxAuthModuleOptions`](../interfaces/ResolvedStynxAuthModuleOptions.md)

##### backend

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md) \| `null`

##### queries

[`PermissionQueryService`](PermissionQueryService.md)

##### metrics

[`PermissionCacheMetrics`](PermissionCacheMetrics.md)

#### Returns

`PermissionCache`

## Methods

### getForSession()

> **getForSession**(`claims`): `Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md)\>

Defined in: [permission-cache.ts:100](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache.ts#L100)

#### Parameters

##### claims

[`StynxAccessTokenClaims`](../interfaces/StynxAccessTokenClaims.md)

#### Returns

`Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md)\>

---

### inspectSid()

> **inspectSid**(`sid`): `Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md) \| `null`\>

Defined in: [permission-cache.ts:156](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache.ts#L156)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md) \| `null`\>

---

### invalidateSid()

> **invalidateSid**(`sid`): `Promise`\<`void`\>

Defined in: [permission-cache.ts:145](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache.ts#L145)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<`void`\>

---

### onModuleDestroy()

> **onModuleDestroy**(): `Promise`\<`void`\>

Defined in: [permission-cache.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache.ts#L92)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleDestroy.onModuleDestroy`

---

### onModuleInit()

> **onModuleInit**(): `Promise`\<`void`\>

Defined in: [permission-cache.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache.ts#L83)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleInit.onModuleInit`

---

### prime()

> **prime**(`record`, `expiresAtIso`): `Promise`\<`void`\>

Defined in: [permission-cache.ts:133](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache.ts#L133)

#### Parameters

##### record

[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md)

##### expiresAtIso

`string`

#### Returns

`Promise`\<`void`\>

---

### publishInvalidation()

> **publishInvalidation**(`message`): `Promise`\<`void`\>

Defined in: [permission-cache.ts:152](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache.ts#L152)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>
