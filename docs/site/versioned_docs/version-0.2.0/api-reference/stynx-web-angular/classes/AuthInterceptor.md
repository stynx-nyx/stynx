[**@stynx-web/angular**](../index.md)

---

[@stynx-web/angular](../index.md) / AuthInterceptor

# Class: AuthInterceptor

Defined in: [angular/src/auth.interceptor.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/auth.interceptor.ts#L11)

## Implements

- `HttpInterceptor`

## Constructors

### Constructor

> **new AuthInterceptor**(): `AuthInterceptor`

#### Returns

`AuthInterceptor`

## Methods

### intercept()

> **intercept**(`request`, `next`): `Observable`\<`HttpEvent`\<`unknown`\>\>

Defined in: [angular/src/auth.interceptor.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/auth.interceptor.ts#L18)

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
