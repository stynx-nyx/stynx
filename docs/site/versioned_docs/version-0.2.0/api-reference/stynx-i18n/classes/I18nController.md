[**@stynx-nyx/i18n**](../index.md)

---

[@stynx-nyx/i18n](../index.md) / I18nController

# Class: I18nController

Defined in: [i18n.controller.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/i18n.controller.ts#L9)

## Constructors

### Constructor

> **new I18nController**(`moduleRef`, `adminService`): `I18nController`

Defined in: [i18n.controller.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/i18n.controller.ts#L10)

#### Parameters

##### moduleRef

`ModuleRef`

##### adminService

[`I18nAdminService`](I18nAdminService.md)

#### Returns

`I18nController`

## Methods

### listOverrides()

> **listOverrides**(): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: [i18n.controller.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/i18n.controller.ts#L16)

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

---

### updateOverrides()

> **updateOverrides**(`input`): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: [i18n.controller.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/i18n.controller.ts#L22)

#### Parameters

##### input

[`TenantOverrideUpdateInput`](../interfaces/TenantOverrideUpdateInput.md)

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>
