[**@stynx-nyx/tenancy**](../index.md)

---

[@stynx-nyx/tenancy](../index.md) / TenantContextInterceptor

# Class: TenantContextInterceptor

Defined in: [tenant-context.interceptor.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenant-context.interceptor.ts#L27)

## Implements

- `NestInterceptor`

## Constructors

### Constructor

> **new TenantContextInterceptor**(`moduleRef`, `requestContext`, `requestContextMutator`, `membershipCache`, `options`): `TenantContextInterceptor`

Defined in: [tenant-context.interceptor.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenant-context.interceptor.ts#L28)

#### Parameters

##### moduleRef

`ModuleRef`

##### requestContext

`RequestContext`

##### requestContextMutator

`RequestContextMutator`

##### membershipCache

[`MembershipAccessCache`](MembershipAccessCache.md)

##### options

[`ResolvedStynxTenancyModuleOptions`](../interfaces/ResolvedStynxTenancyModuleOptions.md)

#### Returns

`TenantContextInterceptor`

## Methods

### intercept()

> **intercept**(`context`, `next`): `Observable`\<`unknown`\>

Defined in: [tenant-context.interceptor.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenant-context.interceptor.ts#L38)

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
