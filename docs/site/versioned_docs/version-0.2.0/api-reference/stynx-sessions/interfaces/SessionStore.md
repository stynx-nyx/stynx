[**@stynx-nyx/sessions**](../index.md)

---

[@stynx-nyx/sessions](../index.md) / SessionStore

# Interface: SessionStore

Defined in: [packages/sessions/src/types.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L83)

## Methods

### createSession()

> **createSession**(`record`): `Promise`\<`void`\>

Defined in: [packages/sessions/src/types.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L84)

#### Parameters

##### record

[`SessionRecord`](SessionRecord.md)

#### Returns

`Promise`\<`void`\>

---

### getSession()

> **getSession**(`sid`): `Promise`\<[`SessionRecord`](SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/types.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L85)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<[`SessionRecord`](SessionRecord.md) \| `null`\>

---

### listSessionIdsByTenant()

> **listSessionIdsByTenant**(`tenantId`): `Promise`\<`string`[]\>

Defined in: [packages/sessions/src/types.ts:97](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L97)

#### Parameters

##### tenantId

`string`

#### Returns

`Promise`\<`string`[]\>

---

### listSessionIdsByUser()

> **listSessionIdsByUser**(`userId`): `Promise`\<`string`[]\>

Defined in: [packages/sessions/src/types.ts:96](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L96)

#### Parameters

##### userId

`string`

#### Returns

`Promise`\<`string`[]\>

---

### lookupRefreshToken()

> **lookupRefreshToken**(`hash`): `Promise`\<[`RefreshTokenLookup`](RefreshTokenLookup.md) \| `null`\>

Defined in: [packages/sessions/src/types.ts:86](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L86)

#### Parameters

##### hash

`string`

#### Returns

`Promise`\<[`RefreshTokenLookup`](RefreshTokenLookup.md) \| `null`\>

---

### publishInvalidation()

> **publishInvalidation**(`message`): `Promise`\<`void`\>

Defined in: [packages/sessions/src/types.ts:98](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L98)

#### Parameters

##### message

`string`

#### Returns

`Promise`\<`void`\>

---

### revokeSession()

> **revokeSession**(`sid`, `revokedAt`, `status`): `Promise`\<[`SessionRecord`](SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/types.ts:95](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L95)

#### Parameters

##### sid

`string`

##### revokedAt

`string`

##### status

[`SessionStatus`](../type-aliases/SessionStatus.md)

#### Returns

`Promise`\<[`SessionRecord`](SessionRecord.md) \| `null`\>

---

### rotateRefreshToken()

> **rotateRefreshToken**(`sid`, `currentHash`, `nextHash`, `idleExpiresAt`, `touchedAt`): `Promise`\<[`SessionRecord`](SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/types.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L87)

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

`Promise`\<[`SessionRecord`](SessionRecord.md) \| `null`\>

---

### touchSession()

> **touchSession**(`sid`, `idleExpiresAt`, `touchedAt`): `Promise`\<[`SessionRecord`](SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/types.ts:94](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L94)

#### Parameters

##### sid

`string`

##### idleExpiresAt

`string`

##### touchedAt

`string`

#### Returns

`Promise`\<[`SessionRecord`](SessionRecord.md) \| `null`\>
