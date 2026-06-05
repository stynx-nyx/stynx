[**@stynx/tenancy**](../index.md)

---

[@stynx/tenancy](../index.md) / TenancyController

# Class: TenancyController

Defined in: [tenancy.controller.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.controller.ts#L9)

## Constructors

### Constructor

> **new TenancyController**(`tenancyService`): `TenancyController`

Defined in: [tenancy.controller.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.controller.ts#L10)

#### Parameters

##### tenancyService

[`TenancyService`](TenancyService.md)

#### Returns

`TenancyController`

## Methods

### archive()

> **archive**(`id`): `Promise`\<[`ArchiveTenantResult`](../interfaces/ArchiveTenantResult.md)\>

Defined in: [tenancy.controller.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.controller.ts#L42)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`ArchiveTenantResult`](../interfaces/ArchiveTenantResult.md)\>

---

### create()

> **create**(`input`): `Promise`\<[`ProvisionTenantResult`](../interfaces/ProvisionTenantResult.md)\>

Defined in: [tenancy.controller.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.controller.ts#L24)

#### Parameters

##### input

[`ProvisionTenantInput`](../interfaces/ProvisionTenantInput.md)

#### Returns

`Promise`\<[`ProvisionTenantResult`](../interfaces/ProvisionTenantResult.md)\>

---

### get()

> **get**(`id`): `Promise`\<[`TenantDetail`](../interfaces/TenantDetail.md)\>

Defined in: [tenancy.controller.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.controller.ts#L18)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`TenantDetail`](../interfaces/TenantDetail.md)\>

---

### list()

> **list**(): `Promise`\<[`TenantSummary`](../interfaces/TenantSummary.md)[]\>

Defined in: [tenancy.controller.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.controller.ts#L13)

#### Returns

`Promise`\<[`TenantSummary`](../interfaces/TenantSummary.md)[]\>

---

### purge()

> **purge**(`id`): `Promise`\<[`PurgeTenantResult`](../interfaces/PurgeTenantResult.md)\>

Defined in: [tenancy.controller.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.controller.ts#L48)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`PurgeTenantResult`](../interfaces/PurgeTenantResult.md)\>

---

### suspend()

> **suspend**(`id`, `input`): `Promise`\<[`SuspendTenantResult`](../interfaces/SuspendTenantResult.md)\>

Defined in: [tenancy.controller.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.controller.ts#L36)

#### Parameters

##### id

`string`

##### input

[`SuspendTenantInput`](../interfaces/SuspendTenantInput.md)

#### Returns

`Promise`\<[`SuspendTenantResult`](../interfaces/SuspendTenantResult.md)\>

---

### update()

> **update**(`id`, `input`): `Promise`\<[`TenantDetail`](../interfaces/TenantDetail.md)\>

Defined in: [tenancy.controller.ts:30](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.controller.ts#L30)

#### Parameters

##### id

`string`

##### input

[`UpdateTenantInput`](../interfaces/UpdateTenantInput.md)

#### Returns

`Promise`\<[`TenantDetail`](../interfaces/TenantDetail.md)\>
