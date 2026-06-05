[**@stynx/sessions**](../index.md)

---

[@stynx/sessions](../index.md) / InMemorySessionStore

# Class: InMemorySessionStore

Defined in: [packages/sessions/src/in-memory-session-store.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L9)

## Implements

- [`SessionStore`](../interfaces/SessionStore.md)

## Constructors

### Constructor

> **new InMemorySessionStore**(): `InMemorySessionStore`

#### Returns

`InMemorySessionStore`

## Properties

### invalidationEvents

> `readonly` **invalidationEvents**: `EventEmitter`\<`DefaultEventMap`\>

Defined in: [packages/sessions/src/in-memory-session-store.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L10)

---

### invalidations

> `readonly` **invalidations**: `string`[] = `[]`

Defined in: [packages/sessions/src/in-memory-session-store.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L11)

## Methods

### createSession()

> **createSession**(`record`): `Promise`\<`void`\>

Defined in: [packages/sessions/src/in-memory-session-store.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L18)

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

Defined in: [packages/sessions/src/in-memory-session-store.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L29)

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

Defined in: [packages/sessions/src/in-memory-session-store.ts:124](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L124)

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

Defined in: [packages/sessions/src/in-memory-session-store.ts:120](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L120)

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

Defined in: [packages/sessions/src/in-memory-session-store.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L34)

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<[`RefreshTokenLookup`](../interfaces/RefreshTokenLookup.md) \| `null`\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`lookupRefreshToken`](../interfaces/SessionStore.md#lookuprefreshtoken)

---

### publishInvalidation()

> **publishInvalidation**(`message`): `Promise`\<`void`\>

Defined in: [packages/sessions/src/in-memory-session-store.ts:128](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L128)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SessionStore`](../interfaces/SessionStore.md).[`publishInvalidation`](../interfaces/SessionStore.md#publishinvalidation)

---

### refreshLookupCount()

> **refreshLookupCount**(): `number`

Defined in: [packages/sessions/src/in-memory-session-store.ts:137](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L137)

#### Returns

`number`

---

### revokeSession()

> **revokeSession**(`sid`, `revokedAt`, `status`): `Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/in-memory-session-store.ts:93](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L93)

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

Defined in: [packages/sessions/src/in-memory-session-store.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L39)

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

### sessionCount()

> **sessionCount**(): `number`

Defined in: [packages/sessions/src/in-memory-session-store.ts:133](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L133)

#### Returns

`number`

---

### touchSession()

> **touchSession**(`sid`, `idleExpiresAt`, `touchedAt`): `Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/in-memory-session-store.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/in-memory-session-store.ts#L74)

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
