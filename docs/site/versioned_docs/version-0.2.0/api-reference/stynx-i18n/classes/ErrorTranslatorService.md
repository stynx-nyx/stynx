[**@stynx-nyx/i18n**](../index.md)

---

[@stynx-nyx/i18n](../index.md) / ErrorTranslatorService

# Class: ErrorTranslatorService

Defined in: [error-translator.service.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/error-translator.service.ts#L6)

## Implements

- `ErrorTranslator`

## Constructors

### Constructor

> **new ErrorTranslatorService**(`localeService`): `ErrorTranslatorService`

Defined in: [error-translator.service.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/error-translator.service.ts#L7)

#### Parameters

##### localeService

[`LocaleService`](LocaleService.md)

#### Returns

`ErrorTranslatorService`

## Methods

### translate()

> **translate**(`key`, `locale`, `vars?`): `string`

Defined in: [error-translator.service.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/error-translator.service.ts#L9)

#### Parameters

##### key

`string`

##### locale

`string`

##### vars?

`Record`\<`string`, `unknown`\> = `{}`

#### Returns

`string`

#### Implementation of

`ErrorTranslator.translate`
