[**@stynx-nyx/i18n**](../index.md)

---

[@stynx-nyx/i18n](../index.md) / CatalogService

# Class: CatalogService

Defined in: [catalog.service.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/catalog.service.ts#L17)

## Constructors

### Constructor

> **new CatalogService**(`moduleRef`, `options`): `CatalogService`

Defined in: [catalog.service.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/catalog.service.ts#L21)

#### Parameters

##### moduleRef

`ModuleRef`

##### options

[`StynxI18nModuleOptions`](../interfaces/StynxI18nModuleOptions.md)

#### Returns

`CatalogService`

## Methods

### primeTenantOverrides()

> **primeTenantOverrides**(`tenantId`): `Promise`\<`void`\>

Defined in: [catalog.service.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/catalog.service.ts#L47)

#### Parameters

##### tenantId

`string`

#### Returns

`Promise`\<`void`\>

---

### setTenantOverrides()

> **setTenantOverrides**(`tenantId`, `overrides`): `void`

Defined in: [catalog.service.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/catalog.service.ts#L54)

#### Parameters

##### tenantId

`string`

##### overrides

`Record`\<`string`, `string`\>

#### Returns

`void`

---

### supportedLocales()

> **supportedLocales**(): `string`[]

Defined in: [catalog.service.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/catalog.service.ts#L27)

#### Returns

`string`[]

---

### tenantOverrides()

> **tenantOverrides**(`tenantId`): `Promise`\<`Record`\<`string`, `string`\>\>

Defined in: [catalog.service.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/catalog.service.ts#L58)

#### Parameters

##### tenantId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `string`\>\>

---

### translate()

> **translate**(`key`, `locale`, `vars?`, `tenantId?`): `string`

Defined in: [catalog.service.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/catalog.service.ts#L31)

#### Parameters

##### key

`string`

##### locale

`string`

##### vars?

`Record`\<`string`, `unknown`\> = `{}`

##### tenantId?

`string`

#### Returns

`string`
