[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / RequiredTenantHeaderResolver

# Class: RequiredTenantHeaderResolver

Defined in: [packages/backend/src/auth/required-tenant-header.resolver.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/required-tenant-header.resolver.ts#L16)

Canonical PEC-style tenant resolver:

- requires explicit tenant header context
- optionally enforces UUID format

## Implements

- [`TenantResolver`](../interfaces/TenantResolver.md)

## Constructors

### Constructor

> **new RequiredTenantHeaderResolver**(`options?`): `RequiredTenantHeaderResolver`

Defined in: [packages/backend/src/auth/required-tenant-header.resolver.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/required-tenant-header.resolver.ts#L20)

#### Parameters

##### options?

[`RequiredTenantHeaderResolverOptions`](../interfaces/RequiredTenantHeaderResolverOptions.md) = `{}`

#### Returns

`RequiredTenantHeaderResolver`

## Methods

### resolve()

> **resolve**(`context`): `string`

Defined in: [packages/backend/src/auth/required-tenant-header.resolver.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/required-tenant-header.resolver.ts#L25)

#### Parameters

##### context

[`TenantResolverContext`](../interfaces/TenantResolverContext.md)

#### Returns

`string`

#### Implementation of

[`TenantResolver`](../interfaces/TenantResolver.md).[`resolve`](../interfaces/TenantResolver.md#resolve)
