[**@stynx/ratelimit**](../index.md)

---

[@stynx/ratelimit](../index.md) / PgRateLimitStoreOptions

# Interface: PgRateLimitStoreOptions

Defined in: [pg-rate-limit.store.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L21)

## Properties

### bucketColumn?

> `optional` **bucketColumn?**: `string`

Defined in: [pg-rate-limit.store.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L25)

---

### executor

> **executor**: [`RateLimitSqlExecutor`](RateLimitSqlExecutor.md)

Defined in: [pg-rate-limit.store.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L22)

---

### expiresAtColumn?

> `optional` **expiresAtColumn?**: `string`

Defined in: [pg-rate-limit.store.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L28)

---

### hitsColumn?

> `optional` **hitsColumn?**: `string`

Defined in: [pg-rate-limit.store.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L27)

---

### table?

> `optional` **table?**: `string`

Defined in: [pg-rate-limit.store.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L23)

---

### tenantColumn?

> `optional` **tenantColumn?**: `string`

Defined in: [pg-rate-limit.store.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L24)

---

### windowStartColumn?

> `optional` **windowStartColumn?**: `string`

Defined in: [pg-rate-limit.store.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/pg-rate-limit.store.ts#L26)
