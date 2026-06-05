[**@stynx/sessions**](../index.md)

---

[@stynx/sessions](../index.md) / RedisSessionStore

# Class: RedisSessionStore

Defined in: [packages/sessions/src/redis-session-store.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L24)

## Implements

- [`SessionStore`](../interfaces/SessionStore.md)
- `OnModuleInit`
- `OnModuleDestroy`

## Constructors

### Constructor

> **new RedisSessionStore**(`options`): `RedisSessionStore`

Defined in: [packages/sessions/src/redis-session-store.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L27)

#### Parameters

##### options

[`ResolvedStynxSessionsModuleOptions`](../interfaces/ResolvedStynxSessionsModuleOptions.md)

#### Returns

`RedisSessionStore`

## Methods

### createSession()

> **createSession**(`record`): `Promise`\<`void`\>

Defined in: [packages/sessions/src/redis-session-store.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L45)

#### Parameters

##### record

[`SessionRecord`](../interfaces/SessionRecord.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`createSession`](../interfaces/SessionStore.md#createsession)

---

### getSession()

> **getSession**(`sid`): `Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/redis-session-store.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L61)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`getSession`](../interfaces/SessionStore.md#getsession)

---

### listSessionIdsByTenant()

> **listSessionIdsByTenant**(`tenantId`): `Promise`\<`string`[]\>

Defined in: [packages/sessions/src/redis-session-store.ts:170](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L170)

#### Parameters

##### tenantId

`string`

#### Returns

`Promise`\<`string`[]\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`listSessionIdsByTenant`](../interfaces/SessionStore.md#listsessionidsbytenant)

---

### listSessionIdsByUser()

> **listSessionIdsByUser**(`userId`): `Promise`\<`string`[]\>

Defined in: [packages/sessions/src/redis-session-store.ts:166](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L166)

#### Parameters

##### userId

`string`

#### Returns

`Promise`\<`string`[]\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`listSessionIdsByUser`](../interfaces/SessionStore.md#listsessionidsbyuser)

---

### lookupRefreshToken()

> **lookupRefreshToken**(`hash`): `Promise`\<[`RefreshTokenLookup`](../interfaces/RefreshTokenLookup.md) \| `null`\>

Defined in: [packages/sessions/src/redis-session-store.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L65)

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<[`RefreshTokenLookup`](../interfaces/RefreshTokenLookup.md) \| `null`\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`lookupRefreshToken`](../interfaces/SessionStore.md#lookuprefreshtoken)

---

### onModuleDestroy()

> **onModuleDestroy**(): `Promise`\<`void`\>

Defined in: [packages/sessions/src/redis-session-store.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L39)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleDestroy.onModuleDestroy`

---

### onModuleInit()

> **onModuleInit**(): `Promise`\<`void`\>

Defined in: [packages/sessions/src/redis-session-store.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L32)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleInit.onModuleInit`

---

### publishInvalidation()

> **publishInvalidation**(`message`): `Promise`\<`void`\>

Defined in: [packages/sessions/src/redis-session-store.ts:174](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L174)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`publishInvalidation`](../interfaces/SessionStore.md#publishinvalidation)

---

### revokeSession()

> **revokeSession**(`sid`, `revokedAt`, `status`): `Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/redis-session-store.ts:135](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L135)

#### Parameters

##### sid

`string`

##### revokedAt

`string`

##### status

[`SessionStatus`](../type-aliases/SessionStatus.md)

#### Returns

`Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`revokeSession`](../interfaces/SessionStore.md#revokesession)

---

### rotateRefreshToken()

> **rotateRefreshToken**(`sid`, `currentHash`, `nextHash`, `idleExpiresAt`, `touchedAt`): `Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/redis-session-store.ts:69](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L69)

#### Parameters

##### sid

`string`

##### currentHash

`string`

##### nextHash

`string`

##### idleExpiresAt

`string`

##### touchedAt

`string`

#### Returns

`Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`rotateRefreshToken`](../interfaces/SessionStore.md#rotaterefreshtoken)

---

### touchSession()

> **touchSession**(`sid`, `idleExpiresAt`, `touchedAt`): `Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/redis-session-store.ts:111](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/redis-session-store.ts#L111)

#### Parameters

##### sid

`string`

##### idleExpiresAt

`string`

##### touchedAt

`string`

#### Returns

`Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`touchSession`](../interfaces/SessionStore.md#touchsession)
