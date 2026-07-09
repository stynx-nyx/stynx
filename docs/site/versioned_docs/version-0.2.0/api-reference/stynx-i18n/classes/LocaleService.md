[**@stynx-nyx/i18n**](../index.md)

---

[@stynx-nyx/i18n](../index.md) / LocaleService

# Class: LocaleService

Defined in: [locale.service.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/locale.service.ts#L8)

## Constructors

### Constructor

> **new LocaleService**(`moduleRef`, `catalogService`): `LocaleService`

Defined in: [locale.service.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/locale.service.ts#L9)

#### Parameters

##### moduleRef

`ModuleRef`

##### catalogService

[`CatalogService`](CatalogService.md)

#### Returns

`LocaleService`

## Methods

### resolve()

> **resolve**(`acceptLanguage?`): `Promise`\<`string`\>

Defined in: [locale.service.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/locale.service.ts#L14)

#### Parameters

##### acceptLanguage?

`string`

#### Returns

`Promise`\<`string`\>

---

### t()

> **t**(`key`, `vars?`, `locale?`): `string`

Defined in: [locale.service.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/locale.service.ts#L58)

#### Parameters

##### key

`string`

##### vars?

`Record`\<`string`, `unknown`\> = `{}`

##### locale?

`string`

#### Returns

`string`
