[**@stynx-nyx/auth**](../index.md)

---

[@stynx-nyx/auth](../index.md) / InMemoryPermissionCacheBackend

# Class: InMemoryPermissionCacheBackend

Defined in: [in-memory-permission-cache-backend.ts:3](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/in-memory-permission-cache-backend.ts#L3)

## Implements

- [`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md)

## Constructors

### Constructor

> **new InMemoryPermissionCacheBackend**(): `InMemoryPermissionCacheBackend`

#### Returns

`InMemoryPermissionCacheBackend`

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [in-memory-permission-cache-backend.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/in-memory-permission-cache-backend.ts#L66)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`close`](../interfaces/PermissionCacheBackend.md#close)

---

### delete()

> **delete**(`sid`): `Promise`\<`void`\>

Defined in: [in-memory-permission-cache-backend.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/in-memory-permission-cache-backend.ts#L19)

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

Defined in: [in-memory-permission-cache-backend.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/in-memory-permission-cache-backend.ts#L9)

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

Defined in: [in-memory-permission-cache-backend.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/in-memory-permission-cache-backend.ts#L29)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`invalidateScope`](../interfaces/PermissionCacheBackend.md#invalidatescope)

---

### publish()

> **publish**(`message`): `Promise`\<`void`\>

Defined in: [in-memory-permission-cache-backend.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/in-memory-permission-cache-backend.ts#L60)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`publish`](../interfaces/PermissionCacheBackend.md#publish)

---

### set()

> **set**(`record`): `Promise`\<`void`\>

Defined in: [in-memory-permission-cache-backend.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/in-memory-permission-cache-backend.ts#L13)

#### Parameters

##### record

[`PermissionCacheRecord`](../interfaces/PermissionCacheRecord.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`set`](../interfaces/PermissionCacheBackend.md#set)

---

### subscribe()

> **subscribe**(`onMessage`): `Promise`\<`void`\>

Defined in: [in-memory-permission-cache-backend.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/in-memory-permission-cache-backend.ts#L56)

#### Parameters

##### onMessage

(`message`) => `Promise`\<`void`\>

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`PermissionCacheBackend`](../interfaces/PermissionCacheBackend.md).[`subscribe`](../interfaces/PermissionCacheBackend.md#subscribe)
