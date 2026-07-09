[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / TenantLifecycleMiddleware

# Class: TenantLifecycleMiddleware

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L48)

## Implements

- `NestMiddleware`

## Constructors

### Constructor

> **new TenantLifecycleMiddleware**(`options?`): `TenantLifecycleMiddleware`

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:51](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L51)

#### Parameters

##### options?

[`TenantLifecycleMiddlewareOptions`](../interfaces/TenantLifecycleMiddlewareOptions.md)

#### Returns

`TenantLifecycleMiddleware`

## Methods

### use()

> **use**(`requestLike`, `responseLike`, `next`): `void`

Defined in: [packages/backend/src/db-context/tenant-lifecycle.middleware.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/tenant-lifecycle.middleware.ts#L60)

#### Parameters

##### requestLike

`unknown`

##### responseLike

`unknown`

##### next

[`TenantLifecycleNext`](../interfaces/TenantLifecycleNext.md)

#### Returns

`void`

#### Implementation of

`NestMiddleware.use`
