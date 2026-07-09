[**@stynx-nyx/auth**](../index.md)

---

[@stynx-nyx/auth](../index.md) / PermissionCacheBackend

# Interface: PermissionCacheBackend

Defined in: [types.ts:77](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L77)

## Methods

### close()

> **close**(): `Promise`\<`void`\>

Defined in: [types.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L84)

#### Returns

`Promise`\<`void`\>

---

### delete()

> **delete**(`sid`): `Promise`\<`void`\>

Defined in: [types.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L80)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<`void`\>

---

### get()

> **get**(`sid`): `Promise`\<[`PermissionCacheRecord`](PermissionCacheRecord.md) \| `null`\>

Defined in: [types.ts:78](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L78)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<[`PermissionCacheRecord`](PermissionCacheRecord.md) \| `null`\>

---

### invalidateScope()

> **invalidateScope**(`message`): `Promise`\<`void`\>

Defined in: [types.ts:81](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L81)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>

---

### publish()

> **publish**(`message`): `Promise`\<`void`\>

Defined in: [types.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L83)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>

---

### set()

> **set**(`record`, `ttlSeconds`): `Promise`\<`void`\>

Defined in: [types.ts:79](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L79)

#### Parameters

##### record

[`PermissionCacheRecord`](PermissionCacheRecord.md)

##### ttlSeconds

`number`

#### Returns

`Promise`\<`void`\>

---

### subscribe()

> **subscribe**(`onMessage`): `Promise`\<`void`\>

Defined in: [types.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L82)

#### Parameters

##### onMessage

(`message`) => `Promise`\<`void`\>

#### Returns

`Promise`\<`void`\>
