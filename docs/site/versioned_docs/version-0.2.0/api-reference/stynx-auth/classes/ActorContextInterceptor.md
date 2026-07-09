[**@stynx-nyx/auth**](../index.md)

---

[@stynx-nyx/auth](../index.md) / ActorContextInterceptor

# Class: ActorContextInterceptor

Defined in: [actor-context.interceptor.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/actor-context.interceptor.ts#L7)

## Implements

- `NestInterceptor`

## Constructors

### Constructor

> **new ActorContextInterceptor**(`requestContextMutator`): `ActorContextInterceptor`

Defined in: [actor-context.interceptor.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/actor-context.interceptor.ts#L8)

#### Parameters

##### requestContextMutator

`RequestContextMutator`

#### Returns

`ActorContextInterceptor`

## Methods

### intercept()

> **intercept**(`context`, `next`): `Observable`\<`unknown`\>

Defined in: [actor-context.interceptor.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/actor-context.interceptor.ts#L10)

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
