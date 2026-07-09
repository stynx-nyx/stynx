[**@stynx-nyx/core**](../index.md)

---

[@stynx-nyx/core](../index.md) / RequestContextInterceptor

# Class: RequestContextInterceptor

Defined in: [packages/core/src/request-context.interceptor.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.interceptor.ts#L49)

## Implements

- `NestInterceptor`

## Constructors

### Constructor

> **new RequestContextInterceptor**(`requestContextMutator`): `RequestContextInterceptor`

Defined in: [packages/core/src/request-context.interceptor.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.interceptor.ts#L50)

#### Parameters

##### requestContextMutator

[`RequestContextMutator`](RequestContextMutator.md)

#### Returns

`RequestContextInterceptor`

## Methods

### intercept()

> **intercept**(`context`, `next`): `Observable`\<`unknown`\>

Defined in: [packages/core/src/request-context.interceptor.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.interceptor.ts#L52)

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
