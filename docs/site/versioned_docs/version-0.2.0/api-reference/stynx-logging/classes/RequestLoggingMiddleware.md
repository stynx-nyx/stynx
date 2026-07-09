[**@stynx-nyx/logging**](../index.md)

---

[@stynx-nyx/logging](../index.md) / RequestLoggingMiddleware

# Class: RequestLoggingMiddleware

Defined in: [request-logging.middleware.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/request-logging.middleware.ts#L19)

## Implements

- `NestMiddleware`

## Constructors

### Constructor

> **new RequestLoggingMiddleware**(`logger`, `options?`): `RequestLoggingMiddleware`

Defined in: [request-logging.middleware.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/request-logging.middleware.ts#L22)

#### Parameters

##### logger

[`StynxLogger`](StynxLogger.md)

##### options?

[`StynxLoggingOptions`](../interfaces/StynxLoggingOptions.md)

#### Returns

`RequestLoggingMiddleware`

## Methods

### use()

> **use**(`request`, `response`, `next`): `void`

Defined in: [request-logging.middleware.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/request-logging.middleware.ts#L31)

#### Parameters

##### request

[`RequestLike`](../interfaces/RequestLike.md)

##### response

[`ResponseLike`](../interfaces/ResponseLike.md)

##### next

[`Next`](../type-aliases/Next.md)

#### Returns

`void`

#### Implementation of

`NestMiddleware.use`
