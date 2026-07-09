[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / RequestLike

# Interface: RequestLike

Defined in: [packages/backend/src/common/request-context.ts:3](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L3)

## Properties

### actor?

> `optional` **actor?**: `unknown`

Defined in: [packages/backend/src/common/request-context.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L14)

---

### body?

> `optional` **body?**: `unknown`

Defined in: [packages/backend/src/common/request-context.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L9)

---

### correlationId?

> `optional` **correlationId?**: `string`

Defined in: [packages/backend/src/common/request-context.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L18)

---

### dbClient?

> `optional` **dbClient?**: `unknown`

Defined in: [packages/backend/src/common/request-context.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L21)

---

### headers

> **headers**: `Record`\<`string`, `unknown`\>

Defined in: [packages/backend/src/common/request-context.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L4)

---

### ip?

> `optional` **ip?**: `string`

Defined in: [packages/backend/src/common/request-context.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L10)

---

### method?

> `optional` **method?**: `string`

Defined in: [packages/backend/src/common/request-context.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L5)

---

### originalUrl?

> `optional` **originalUrl?**: `string`

Defined in: [packages/backend/src/common/request-context.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L8)

---

### path?

> `optional` **path?**: `string`

Defined in: [packages/backend/src/common/request-context.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L6)

---

### pgClient?

> `optional` **pgClient?**: `unknown`

Defined in: [packages/backend/src/common/request-context.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L20)

---

### principal?

> `optional` **principal?**: [`Principal`](Principal.md)

Defined in: [packages/backend/src/common/request-context.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L15)

---

### principalContext?

> `optional` **principalContext?**: [`RequestPrincipalContext`](RequestPrincipalContext.md)

Defined in: [packages/backend/src/common/request-context.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L16)

---

### requestId?

> `optional` **requestId?**: `string`

Defined in: [packages/backend/src/common/request-context.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L19)

---

### res?

> `optional` **res?**: `unknown`

Defined in: [packages/backend/src/common/request-context.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L11)

---

### response?

> `optional` **response?**: `unknown`

Defined in: [packages/backend/src/common/request-context.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L12)

---

### tenantId?

> `optional` **tenantId?**: `string`

Defined in: [packages/backend/src/common/request-context.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L17)

---

### url?

> `optional` **url?**: `string`

Defined in: [packages/backend/src/common/request-context.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L7)

---

### user?

> `optional` **user?**: `unknown`

Defined in: [packages/backend/src/common/request-context.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/common/request-context.ts#L13)
