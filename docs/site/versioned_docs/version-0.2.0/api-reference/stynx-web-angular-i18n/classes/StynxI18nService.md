[**@stynx-nyx/angular-i18n**](../index.md)

---

[@stynx-nyx/angular-i18n](../index.md) / StynxI18nService

# Class: StynxI18nService

Defined in: [i18n.service.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/i18n.service.ts#L14)

## Constructors

### Constructor

> **new StynxI18nService**(): `StynxI18nService`

Defined in: [i18n.service.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/i18n.service.ts#L23)

#### Returns

`StynxI18nService`

## Properties

### catalog

> `readonly` **catalog**: `Signal`\<[`StynxCatalog`](../type-aliases/StynxCatalog.md)\>

Defined in: [i18n.service.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/i18n.service.ts#L20)

---

### locale

> `readonly` **locale**: `Signal`\<`string`\>

Defined in: [i18n.service.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/i18n.service.ts#L19)

---

### supportedLocales

> `readonly` **supportedLocales**: `string`[]

Defined in: [i18n.service.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/i18n.service.ts#L21)

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [i18n.service.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/i18n.service.ts#L28)

#### Returns

`Promise`\<`void`\>

---

### translate()

> **translate**(`key`, `params?`): `string`

Defined in: [i18n.service.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/i18n.service.ts#L39)

#### Parameters

##### key

`string`

##### params?

`Record`\<`string`, `string` \| `number`\> = `{}`

#### Returns

`string`

---

### use()

> **use**(`locale`): `Promise`\<`void`\>

Defined in: [i18n.service.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/i18n.service.ts#L32)

#### Parameters

##### locale

`string`

#### Returns

`Promise`\<`void`\>
