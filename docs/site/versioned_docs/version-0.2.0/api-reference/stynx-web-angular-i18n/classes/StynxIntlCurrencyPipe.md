[**@stynx-nyx/angular-i18n**](../index.md)

---

[@stynx-nyx/angular-i18n](../index.md) / StynxIntlCurrencyPipe

# Class: StynxIntlCurrencyPipe

Defined in: [intl.pipes.ts:102](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/intl.pipes.ts#L102)

## Extends

- `LocaleAwarePipe`

## Implements

- `PipeTransform`

## Constructors

### Constructor

> **new StynxIntlCurrencyPipe**(): `StynxIntlCurrencyPipe`

#### Returns

`StynxIntlCurrencyPipe`

#### Inherited from

`LocaleAwarePipe.constructor`

## Properties

### i18n

> `protected` `readonly` **i18n**: [`StynxI18nService`](StynxI18nService.md)

Defined in: [intl.pipes.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/intl.pipes.ts#L31)

#### Inherited from

`LocaleAwarePipe.i18n`

## Methods

### locale()

> `protected` **locale**(): `string`

Defined in: [intl.pipes.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/intl.pipes.ts#L35)

#### Returns

`string`

#### Inherited from

`LocaleAwarePipe.locale`

---

### transform()

> **transform**(`value`, `currency?`, `options?`): `string`

Defined in: [intl.pipes.ts:105](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/intl.pipes.ts#L105)

#### Parameters

##### value

`NumberInput`

##### currency?

`string` = `'USD'`

##### options?

`Omit`\<`Intl.NumberFormatOptions`, `"currency"` \| `"style"`\> = `{}`

#### Returns

`string`

#### Implementation of

`PipeTransform.transform`
