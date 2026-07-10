[**@stynx-nyx/angular**](../index.md)

---

[@stynx-nyx/angular](../index.md) / TenantContextService

# Class: TenantContextService

Defined in: [angular-tenancy/src/tenant-context.service.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L44)

## Constructors

### Constructor

> **new TenantContextService**(): `TenantContextService`

#### Returns

`TenantContextService`

## Properties

### activeTenant

> `readonly` **activeTenant**: `Signal`\<`TenantContextSnapshot` \| `null`\>

Defined in: [angular-tenancy/src/tenant-context.service.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L74)

---

### ~~activeTenant$~~

> `readonly` **activeTenant$**: `Observable`\<`TenantContextSnapshot` \| `null`\>

Defined in: [angular-tenancy/src/tenant-context.service.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L82)

#### Deprecated

since: 1.x — use toObservable(this.activeTenant) or the signal directly.

---

### availableTenants

> `readonly` **availableTenants**: `Signal`\<readonly `TenantOption`[]\>

Defined in: [angular-tenancy/src/tenant-context.service.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L52)

---

### ~~currentTenantId$~~

> `readonly` **currentTenantId$**: `Observable`\<`string` \| `null`\>

Defined in: [angular-tenancy/src/tenant-context.service.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L66)

#### Deprecated

since: 1.x — use toObservable(this.tenantId) or the signal directly.

---

### tenantChanged$

> `readonly` **tenantChanged$**: `Observable`\<`TenantTransition`\>

Defined in: [angular-tenancy/src/tenant-context.service.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L62)

---

### tenantId

> `readonly` **tenantId**: `Signal`\<`string` \| `null`\>

Defined in: [angular-tenancy/src/tenant-context.service.ts:51](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L51)

---

### ~~tenantId$~~

> `readonly` **tenantId$**: `Observable`\<`string` \| `null`\>

Defined in: [angular-tenancy/src/tenant-context.service.ts:73](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L73)

#### Deprecated

since: 1.x — use toObservable(this.tenantId) or the signal directly.

---

### tenantLabel

> `readonly` **tenantLabel**: `Signal`\<`string` \| `null`\>

Defined in: [angular-tenancy/src/tenant-context.service.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L53)

## Methods

### clear()

> **clear**(): `void`

Defined in: [angular-tenancy/src/tenant-context.service.ts:127](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L127)

#### Returns

`void`

---

### initialize()

> **initialize**(`seed?`): `Promise`\<`void`\>

Defined in: [angular-tenancy/src/tenant-context.service.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L87)

#### Parameters

##### seed?

###### host?

`string`

###### url?

`string`

#### Returns

`Promise`\<`void`\>

---

### setAvailableTenants()

> **setAvailableTenants**(`tenants`): `void`

Defined in: [angular-tenancy/src/tenant-context.service.ts:123](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L123)

#### Parameters

##### tenants

readonly `TenantOption`[]

#### Returns

`void`

---

### setTenant()

> **setTenant**(`id`, `source?`): `void`

Defined in: [angular-tenancy/src/tenant-context.service.ts:111](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-context.service.ts#L111)

#### Parameters

##### id

`string`

##### source?

`"manual"` \| `"query"` \| `"subdomain"` \| `"default"`

#### Returns

`void`
