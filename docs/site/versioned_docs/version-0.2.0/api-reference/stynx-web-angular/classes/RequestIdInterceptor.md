[**@stynx-nyx/angular**](../index.md)

---

[@stynx-nyx/angular](../index.md) / RequestIdInterceptor

# Class: RequestIdInterceptor

Defined in: [angular/src/request-id.interceptor.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/request-id.interceptor.ts#L7)

## Implements

- `HttpInterceptor`

## Constructors

### Constructor

> **new RequestIdInterceptor**(): `RequestIdInterceptor`

#### Returns

`RequestIdInterceptor`

## Methods

### intercept()

> **intercept**(`request`, `next`): `Observable`\<`HttpEvent`\<`unknown`\>\>

Defined in: [angular/src/request-id.interceptor.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/request-id.interceptor.ts#L8)

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
