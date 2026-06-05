[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / TenantLifecycleMiddlewareOptions

# Interface: TenantLifecycleMiddlewareOptions

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L28)

## Properties

### enforceTenantUuid?

> `optional` **enforceTenantUuid?**: `boolean`

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L31)

---

### releaseEvents?

> `optional` **releaseEvents?**: readonly (`"finish"` \| `"close"`)[]

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L32)

---

### releaseMethodName?

> `optional` **releaseMethodName?**: `string`

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L34)

---

### requestClientKeys?

> `optional` **requestClientKeys?**: readonly `string`[]

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L33)

---

### requireTenantHeader?

> `optional` **requireTenantHeader?**: `boolean`

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:30](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L30)

---

### tenantHeaderName?

> `optional` **tenantHeaderName?**: `string`

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L29)
