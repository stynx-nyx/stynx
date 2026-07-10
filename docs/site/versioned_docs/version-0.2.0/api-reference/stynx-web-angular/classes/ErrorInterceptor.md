[**@stynx-nyx/angular**](../index.md)

---

[@stynx-nyx/angular](../index.md) / ErrorInterceptor

# Class: ErrorInterceptor

Defined in: [angular/src/error.interceptor.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/error.interceptor.ts#L10)

## Implements

- `HttpInterceptor`

## Constructors

### Constructor

> **new ErrorInterceptor**(): `ErrorInterceptor`

#### Returns

`ErrorInterceptor`

## Methods

### intercept()

> **intercept**(`request`, `next`): `Observable`\<`HttpEvent`\<`unknown`\>\>

Defined in: [angular/src/error.interceptor.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/error.interceptor.ts#L13)

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
