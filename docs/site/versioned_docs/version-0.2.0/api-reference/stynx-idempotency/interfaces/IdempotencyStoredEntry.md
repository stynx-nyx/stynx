[**@stynx/idempotency**](../index.md)

---

[@stynx/idempotency](../index.md) / IdempotencyStoredEntry

# Interface: IdempotencyStoredEntry

Defined in: [types.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L20)

## Properties

### body

> **body**: `unknown`

Defined in: [types.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L23)

---

### expiresAt

> **expiresAt**: `number`

Defined in: [types.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L25)

---

### headers

> **headers**: `Record`\<`string`, `string`\>

Defined in: [types.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L24)

---

### requestFingerprint

> **requestFingerprint**: `string`

Defined in: [types.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L21)

---

### status

> **status**: `"completed"` \| `"pending"`

Defined in: [types.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L26)

---

### statusCode

> **statusCode**: `number` \| `null`

Defined in: [types.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/types.ts#L22)
