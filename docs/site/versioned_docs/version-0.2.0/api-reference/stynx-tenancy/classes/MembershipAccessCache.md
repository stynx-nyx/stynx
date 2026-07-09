[**@stynx-nyx/tenancy**](../index.md)

---

[@stynx-nyx/tenancy](../index.md) / MembershipAccessCache

# Class: MembershipAccessCache

Defined in: [membership-cache.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/membership-cache.ts#L6)

## Constructors

### Constructor

> **new MembershipAccessCache**(`ttlMs`, `maxEntries`): `MembershipAccessCache`

Defined in: [membership-cache.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/membership-cache.ts#L9)

#### Parameters

##### ttlMs

`number`

##### maxEntries

`number`

#### Returns

`MembershipAccessCache`

## Methods

### clear()

> **clear**(): `void`

Defined in: [membership-cache.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/membership-cache.ts#L43)

#### Returns

`void`

---

### get()

> **get**(`userId`, `tenantId`): `boolean` \| `undefined`

Defined in: [membership-cache.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/membership-cache.ts#L14)

#### Parameters

##### userId

`string`

##### tenantId

`string`

#### Returns

`boolean` \| `undefined`

---

### invalidateTenant()

> **invalidateTenant**(`tenantId`): `void`

Defined in: [membership-cache.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/membership-cache.ts#L47)

#### Parameters

##### tenantId

`string`

#### Returns

`void`

---

### set()

> **set**(`userId`, `tenantId`, `allowed`): `void`

Defined in: [membership-cache.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/membership-cache.ts#L29)

#### Parameters

##### userId

`string`

##### tenantId

`string`

##### allowed

`boolean`

#### Returns

`void`
