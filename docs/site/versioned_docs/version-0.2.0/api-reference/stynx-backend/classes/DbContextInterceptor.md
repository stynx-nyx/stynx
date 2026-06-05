[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / DbContextInterceptor

# Class: DbContextInterceptor

Defined in: [packages/backend/src/db-context/db-context.interceptor.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/db-context.interceptor.ts#L19)

## Implements

- `NestInterceptor`

## Constructors

### Constructor

> **new DbContextInterceptor**(`dbContextApplier`, `dbClientResolver?`, `dbClientLifecycle?`): `DbContextInterceptor`

Defined in: [packages/backend/src/db-context/db-context.interceptor.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/db-context.interceptor.ts#L20)

#### Parameters

##### dbContextApplier

[`DbContextApplier`](../interfaces/DbContextApplier.md)

##### dbClientResolver?

[`DbClientResolver`](../type-aliases/DbClientResolver.md)

##### dbClientLifecycle?

[`RequestDbClientLifecycle`](../interfaces/RequestDbClientLifecycle.md)

#### Returns

`DbContextInterceptor`

## Methods

### intercept()

> **intercept**(`context`, `next`): `Observable`\<`unknown`\>

Defined in: [packages/backend/src/db-context/db-context.interceptor.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/db-context.interceptor.ts#L29)

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
