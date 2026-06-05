[**@stynx-web/angular**](../index.md)

---

[@stynx-web/angular](../index.md) / TenantInterceptor

# Class: TenantInterceptor

Defined in: [angular-tenancy/src/tenant.interceptor.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant.interceptor.ts#L7)

## Implements

- `HttpInterceptor`

## Constructors

### Constructor

> **new TenantInterceptor**(): `TenantInterceptor`

#### Returns

`TenantInterceptor`

## Methods

### intercept()

> **intercept**(`request`, `next`): `Observable`\<`HttpEvent`\<`unknown`\>\>

Defined in: [angular-tenancy/src/tenant.interceptor.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant.interceptor.ts#L10)

Identifies and handles a given HTTP request.

#### Parameters

##### request

`HttpRequest`\<`unknown`\>

##### next

`HttpHandler`

The next interceptor in the chain, or the backend
if no interceptors remain in the chain.

#### Returns

`Observable`\<`HttpEvent`\<`unknown`\>\>

An observable of the event stream.

#### Implementation of

`HttpInterceptor.intercept`
