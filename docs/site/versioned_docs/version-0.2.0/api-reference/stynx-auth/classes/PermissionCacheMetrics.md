[**@stynx-nyx/auth**](../index.md)

---

[@stynx-nyx/auth](../index.md) / PermissionCacheMetrics

# Class: PermissionCacheMetrics

Defined in: [permission-cache-metrics.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache-metrics.ts#L6)

## Constructors

### Constructor

> **new PermissionCacheMetrics**(): `PermissionCacheMetrics`

#### Returns

`PermissionCacheMetrics`

## Methods

### increment()

> **increment**(`tier`): `void`

Defined in: [permission-cache-metrics.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache-metrics.ts#L13)

#### Parameters

##### tier

[`PermissionCacheTier`](../type-aliases/PermissionCacheTier.md)

#### Returns

`void`

---

### snapshot()

> **snapshot**(): `Record`\<[`PermissionCacheTier`](../type-aliases/PermissionCacheTier.md), `number`\>

Defined in: [permission-cache-metrics.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-cache-metrics.ts#L17)

#### Returns

`Record`\<[`PermissionCacheTier`](../type-aliases/PermissionCacheTier.md), `number`\>
