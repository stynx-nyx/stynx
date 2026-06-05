[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / RedisPermissionCacheBackend

# Class: RedisPermissionCacheBackend

Defined in: [redis-permission-cache-backend.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L7)

## Implements

- [`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md)
- `OnModuleInit`
- `OnModuleDestroy`

## Constructors

### Constructor

> **new RedisPermissionCacheBackend**(`options`): `RedisPermissionCacheBackend`

Defined in: [redis-permission-cache-backend.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L12)

#### Parameters

##### options

[`ResolvedStynxAuthModuleOptions`](../interfaces/ResolvedStynxAuthModuleOptions.md)

#### Returns

`RedisPermissionCacheBackend`

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [redis-permission-cache-backend.ts:133](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L133)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`close`](../interfaces/PermissionCacheBackend.md#close)

---

### delete()

> **delete**(`sid`): `Promise`\<`void`\>

Defined in: [redis-permission-cache-backend.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L66)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`delete`](../interfaces/PermissionCacheBackend.md#delete)

---

### get()

> **get**(`sid`): `Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md) \| `null`\>

Defined in: [redis-permission-cache-backend.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L45)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md) \| `null`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`get`](../interfaces/PermissionCacheBackend.md#get)

---

### invalidateScope()

> **invalidateScope**(`message`): `Promise`\<`void`\>

Defined in: [redis-permission-cache-backend.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L80)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`invalidateScope`](../interfaces/PermissionCacheBackend.md#invalidatescope)

---

### onModuleDestroy()

> **onModuleDestroy**(): `Promise`\<`void`\>

Defined in: [redis-permission-cache-backend.ts:142](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L142)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleDestroy.onModuleDestroy`

---

### onModuleInit()

> **onModuleInit**(): `Promise`\<`void`\>

Defined in: [redis-permission-cache-backend.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L17)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleInit.onModuleInit`

---

### publish()

> **publish**(`message`): `Promise`\<`void`\>

Defined in: [redis-permission-cache-backend.ts:127](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L127)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`publish`](../interfaces/PermissionCacheBackend.md#publish)

---

### set()

> **set**(`record`, `ttlSeconds`): `Promise`\<`void`\>

Defined in: [redis-permission-cache-backend.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L53)

#### Parameters

##### record

[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md)

##### ttlSeconds

`number`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`set`](../interfaces/PermissionCacheBackend.md#set)

---

### subscribe()

> **subscribe**(`onMessage`): `Promise`\<`void`\>

Defined in: [redis-permission-cache-backend.ts:118](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/redis-permission-cache-backend.ts#L118)

#### Parameters

##### onMessage

(`message`) => `Promise`\<`void`\>

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`subscribe`](../interfaces/PermissionCacheBackend.md#subscribe)
