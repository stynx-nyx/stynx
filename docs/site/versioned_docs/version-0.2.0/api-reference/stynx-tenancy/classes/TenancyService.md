[**@stynx/tenancy**](../index.md)

---

[@stynx/tenancy](../index.md) / TenancyService

# Class: TenancyService

Defined in: [tenancy.service.ts:94](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.service.ts#L94)

## Constructors

### Constructor

> **new TenancyService**(`moduleRef`, `membershipCache`, `prefixProvisioner?`, `inviteSender?`, `archiveExporter?`, `purgeDelegate?`): `TenancyService`

Defined in: [tenancy.service.ts:95](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.service.ts#L95)

#### Parameters

##### moduleRef

`ModuleRef`

##### membershipCache

[`MembershipAccessCache`](MembershipAccessCache.md)

##### prefixProvisioner?

[`TenantPrefixProvisioner`](../interfaces/TenantPrefixProvisioner.md)

##### inviteSender?

[`TenantInviteSender`](../interfaces/TenantInviteSender.md)

##### archiveExporter?

[`TenantArchiveExporter`](../interfaces/TenantArchiveExporter.md)

##### purgeDelegate?

[`TenantPurgeDelegate`](../interfaces/TenantPurgeDelegate.md)

#### Returns

`TenancyService`

## Methods

### archiveTenant()

> **archiveTenant**(`id`): `Promise`\<[`ArchiveTenantResult`](../interfaces/ArchiveTenantResult.md)\>

Defined in: [tenancy.service.ts:341](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.service.ts#L341)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`ArchiveTenantResult`](../interfaces/ArchiveTenantResult.md)\>

---

### getTenant()

> **getTenant**(`id`): `Promise`\<[`TenantDetail`](../interfaces/TenantDetail.md)\>

Defined in: [tenancy.service.ts:131](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.service.ts#L131)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`TenantDetail`](../interfaces/TenantDetail.md)\>

---

### listTenants()

> **listTenants**(): `Promise`\<[`TenantSummary`](../interfaces/TenantSummary.md)[]\>

Defined in: [tenancy.service.ts:119](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.service.ts#L119)

#### Returns

`Promise`\<[`TenantSummary`](../interfaces/TenantSummary.md)[]\>

---

### provisionTenant()

> **provisionTenant**(`input`): `Promise`\<[`ProvisionTenantResult`](../interfaces/ProvisionTenantResult.md)\>

Defined in: [tenancy.service.ts:192](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.service.ts#L192)

#### Parameters

##### input

[`ProvisionTenantInput`](../interfaces/ProvisionTenantInput.md)

#### Returns

`Promise`\<[`ProvisionTenantResult`](../interfaces/ProvisionTenantResult.md)\>

---

### purgeTenant()

> **purgeTenant**(`id`): `Promise`\<[`PurgeTenantResult`](../interfaces/PurgeTenantResult.md)\>

Defined in: [tenancy.service.ts:374](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.service.ts#L374)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`PurgeTenantResult`](../interfaces/PurgeTenantResult.md)\>

---

### suspendTenant()

> **suspendTenant**(`id`, `input`): `Promise`\<[`SuspendTenantResult`](../interfaces/SuspendTenantResult.md)\>

Defined in: [tenancy.service.ts:298](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.service.ts#L298)

#### Parameters

##### id

`string`

##### input

[`SuspendTenantInput`](../interfaces/SuspendTenantInput.md)

#### Returns

`Promise`\<[`SuspendTenantResult`](../interfaces/SuspendTenantResult.md)\>

---

### updateTenant()

> **updateTenant**(`id`, `input`): `Promise`\<[`TenantDetail`](../interfaces/TenantDetail.md)\>

Defined in: [tenancy.service.ts:145](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenancy.service.ts#L145)

#### Parameters

##### id

`string`

##### input

[`UpdateTenantInput`](../interfaces/UpdateTenantInput.md)

#### Returns

`Promise`\<[`TenantDetail`](../interfaces/TenantDetail.md)\>
