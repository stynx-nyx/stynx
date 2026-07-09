[**@stynx-nyx/i18n**](../index.md)

---

[@stynx-nyx/i18n](../index.md) / I18nAdminService

# Class: I18nAdminService

Defined in: [i18n-admin.service.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/i18n-admin.service.ts#L8)

## Constructors

### Constructor

> **new I18nAdminService**(`moduleRef`, `catalogService`): `I18nAdminService`

Defined in: [i18n-admin.service.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/i18n-admin.service.ts#L9)

#### Parameters

##### moduleRef

`ModuleRef`

##### catalogService

[`CatalogService`](CatalogService.md)

#### Returns

`I18nAdminService`

## Methods

### listOverrides()

> **listOverrides**(`tenantId`): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: [i18n-admin.service.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/i18n-admin.service.ts#L14)

#### Parameters

##### tenantId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

---

### updateOverrides()

> **updateOverrides**(`tenantId`, `input`): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: [i18n-admin.service.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/i18n-admin.service.ts#L33)

#### Parameters

##### tenantId

`string`

##### input

[`TenantOverrideUpdateInput`](../interfaces/TenantOverrideUpdateInput.md)

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>
