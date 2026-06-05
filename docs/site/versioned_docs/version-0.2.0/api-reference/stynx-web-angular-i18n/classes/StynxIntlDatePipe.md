[**@stynx-web/angular-i18n**](../index.md)

---

[@stynx-web/angular-i18n](../index.md) / StynxIntlDatePipe

# Class: StynxIntlDatePipe

Defined in: [intl.pipes.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/intl.pipes.ts#L50)

## Extends

- `LocaleAwarePipe`

## Implements

- `PipeTransform`

## Constructors

### Constructor

> **new StynxIntlDatePipe**(): `StynxIntlDatePipe`

#### Returns

`StynxIntlDatePipe`

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

> **transform**(`value`, `options?`): `string`

Defined in: [intl.pipes.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/intl.pipes.ts#L53)

#### Parameters

##### value

`DateInput`

##### options?

`DateTimeFormatOptions` = `{}`

#### Returns

`string`

#### Implementation of

`PipeTransform.transform`
