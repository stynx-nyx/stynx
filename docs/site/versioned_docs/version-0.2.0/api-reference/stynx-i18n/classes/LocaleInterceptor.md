[**@stynx/i18n**](../index.md)

---

[@stynx/i18n](../index.md) / LocaleInterceptor

# Class: LocaleInterceptor

Defined in: [locale.interceptor.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/locale.interceptor.ts#L7)

## Implements

- `NestInterceptor`

## Constructors

### Constructor

> **new LocaleInterceptor**(`localeService`): `LocaleInterceptor`

Defined in: [locale.interceptor.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/locale.interceptor.ts#L8)

#### Parameters

##### localeService

[`LocaleService`](LocaleService.md)

#### Returns

`LocaleInterceptor`

## Methods

### intercept()

> **intercept**(`context`, `next`): `Observable`\<`unknown`\>

Defined in: [locale.interceptor.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/i18n/src/locale.interceptor.ts#L10)

Method to implement a custom interceptor.

#### Parameters

##### context

`ExecutionContext`

an `ExecutionContext` object providing methods to access the
route handler and class about to be invoked.

##### next

`CallHandler`

a reference to the `CallHandler`, which provides access to an
`Observable` representing the response stream from the route handler.

#### Returns

`Observable`\<`unknown`\>

#### Implementation of

`NestInterceptor.intercept`
