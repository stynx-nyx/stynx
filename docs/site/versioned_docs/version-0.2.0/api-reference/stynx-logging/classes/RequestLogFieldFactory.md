[**@stynx/logging**](../index.md)

---

[@stynx/logging](../index.md) / RequestLogFieldFactory

# Class: RequestLogFieldFactory

Defined in: [pino.factory.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/pino.factory.ts#L82)

## Constructors

### Constructor

> **new RequestLogFieldFactory**(`requestContext`): `RequestLogFieldFactory`

Defined in: [pino.factory.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/pino.factory.ts#L83)

#### Parameters

##### requestContext

`RequestContext`

#### Returns

`RequestLogFieldFactory`

## Methods

### create()

> **create**(`extra?`): [`RequestScopedLogFields`](../interfaces/RequestScopedLogFields.md)

Defined in: [pino.factory.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/pino.factory.ts#L85)

#### Parameters

##### extra?

[`RequestScopedLogFields`](../interfaces/RequestScopedLogFields.md) = `{}`

#### Returns

[`RequestScopedLogFields`](../interfaces/RequestScopedLogFields.md)
