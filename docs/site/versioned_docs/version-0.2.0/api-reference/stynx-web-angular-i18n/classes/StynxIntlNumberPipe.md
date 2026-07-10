[**@stynx-nyx/angular-i18n**](../index.md)

---

[@stynx-nyx/angular-i18n](../index.md) / StynxIntlNumberPipe

# Class: StynxIntlNumberPipe

Defined in: [intl.pipes.ts:76](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/intl.pipes.ts#L76)

## Extends

- `LocaleAwarePipe`

## Implements

- `PipeTransform`

## Constructors

### Constructor

> **new StynxIntlNumberPipe**(): `StynxIntlNumberPipe`

#### Returns

`StynxIntlNumberPipe`

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

Defined in: [intl.pipes.ts:79](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-i18n/src/intl.pipes.ts#L79)

#### Parameters

##### value

`NumberInput`

##### options?

`NumberFormatOptions` = `{}`

#### Returns

`string`

#### Implementation of

`PipeTransform.transform`
