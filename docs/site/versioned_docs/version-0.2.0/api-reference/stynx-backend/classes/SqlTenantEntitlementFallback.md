[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / SqlTenantEntitlementFallback

# Class: SqlTenantEntitlementFallback

Defined in: [packages/backend/src/auth/sql-tenant-entitlement.fallback.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/sql-tenant-entitlement.fallback.ts#L48)

Optional fallback checker for ClaimFirstTenantEntitlementPolicy.
Mirrors PEC DB fallback behavior over local `auth.users` records.

## Implements

- [`TenantEntitlementFallback`](../interfaces/TenantEntitlementFallback.md)

## Constructors

### Constructor

> **new SqlTenantEntitlementFallback**(`options`): `SqlTenantEntitlementFallback`

Defined in: [packages/backend/src/auth/sql-tenant-entitlement.fallback.ts:55](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/sql-tenant-entitlement.fallback.ts#L55)

#### Parameters

##### options

[`SqlTenantEntitlementFallbackOptions`](../interfaces/SqlTenantEntitlementFallbackOptions.md)

#### Returns

`SqlTenantEntitlementFallback`

## Methods

### isEntitled()

> **isEntitled**(`context`): `Promise`\<`boolean`\>

Defined in: [packages/backend/src/auth/sql-tenant-entitlement.fallback.ts:75](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/sql-tenant-entitlement.fallback.ts#L75)

#### Parameters

##### context

[`TenantEntitlementContext`](../interfaces/TenantEntitlementContext.md)

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`TenantEntitlementFallback`](../interfaces/TenantEntitlementFallback.md).[`isEntitled`](../interfaces/TenantEntitlementFallback.md#isentitled)
