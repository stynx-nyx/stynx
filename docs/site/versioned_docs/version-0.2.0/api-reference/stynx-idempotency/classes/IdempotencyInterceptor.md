[**@stynx/idempotency**](../index.md)

---

[@stynx/idempotency](../index.md) / IdempotencyInterceptor

# Class: IdempotencyInterceptor

Defined in: [idempotency.interceptor.ts:97](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/idempotency.interceptor.ts#L97)

## Implements

- `NestInterceptor`

## Constructors

### Constructor

> **new IdempotencyInterceptor**(`reflector`, `options?`, `durableStore?`, `backend?`, `metrics?`): `IdempotencyInterceptor`

Defined in: [idempotency.interceptor.ts:100](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/idempotency.interceptor.ts#L100)

#### Parameters

##### reflector

`Reflector`

##### options?

[`IdempotencyInterceptorOptions`](../interfaces/IdempotencyInterceptorOptions.md) = `{}`

##### durableStore?

[`IdempotencyStore`](../interfaces/IdempotencyStore.md)

##### backend?

[`IdempotencyBackend`](../interfaces/IdempotencyBackend.md)

##### metrics?

[`IdempotencyMetricsSink`](../interfaces/IdempotencyMetricsSink.md)

#### Returns

`IdempotencyInterceptor`

## Methods

### intercept()

> **intercept**(`context`, `next`): `Observable`\<`unknown`\>

Defined in: [idempotency.interceptor.ts:120](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/idempotency/src/idempotency.interceptor.ts#L120)

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
