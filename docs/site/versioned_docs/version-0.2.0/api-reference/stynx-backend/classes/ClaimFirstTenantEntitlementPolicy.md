[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / ClaimFirstTenantEntitlementPolicy

# Class: ClaimFirstTenantEntitlementPolicy

Defined in: [packages/backend/src/auth/claim-first-tenant-entitlement.policy.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/claim-first-tenant-entitlement.policy.ts#L32)

Canonical PEC-style tenant entitlement:

- if tenant claims exist, they are authoritative
- if no tenant claim exists, optional fallback checker may query local DB

## Implements

- [`TenantEntitlementPolicy`](../interfaces/TenantEntitlementPolicy.md)

## Constructors

### Constructor

> **new ClaimFirstTenantEntitlementPolicy**(`options?`): `ClaimFirstTenantEntitlementPolicy`

Defined in: [packages/backend/src/auth/claim-first-tenant-entitlement.policy.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/claim-first-tenant-entitlement.policy.ts#L35)

#### Parameters

##### options?

[`ClaimFirstTenantEntitlementPolicyOptions`](../interfaces/ClaimFirstTenantEntitlementPolicyOptions.md) = `{}`

#### Returns

`ClaimFirstTenantEntitlementPolicy`

## Methods

### isEntitled()

> **isEntitled**(`context`): `Promise`\<`boolean`\>

Defined in: [packages/backend/src/auth/claim-first-tenant-entitlement.policy.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/claim-first-tenant-entitlement.policy.ts#L39)

#### Parameters

##### context

[`TenantEntitlementContext`](../interfaces/TenantEntitlementContext.md)

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`TenantEntitlementPolicy`](../interfaces/TenantEntitlementPolicy.md).[`isEntitled`](../interfaces/TenantEntitlementPolicy.md#isentitled)
