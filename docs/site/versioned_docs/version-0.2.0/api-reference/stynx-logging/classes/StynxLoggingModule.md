[**@stynx/logging**](../index.md)

---

[@stynx/logging](../index.md) / StynxLoggingModule

# Class: StynxLoggingModule

Defined in: [logging.module.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logging.module.ts#L16)

## Implements

- `NestModule`

## Constructors

### Constructor

> **new StynxLoggingModule**(): `StynxLoggingModule`

#### Returns

`StynxLoggingModule`

## Methods

### configure()

> **configure**(`consumer`): `void`

Defined in: [logging.module.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logging.module.ts#L54)

#### Parameters

##### consumer

`MiddlewareConsumer`

#### Returns

`void`

#### Implementation of

`NestModule.configure`

---

### forRoot()

> `static` **forRoot**(`options?`): `DynamicModule`

Defined in: [logging.module.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logging.module.ts#L17)

#### Parameters

##### options?

[`StynxLoggingOptions`](../interfaces/StynxLoggingOptions.md) = `{}`

#### Returns

`DynamicModule`
