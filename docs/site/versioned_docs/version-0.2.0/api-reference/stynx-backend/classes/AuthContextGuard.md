[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / AuthContextGuard

# Class: AuthContextGuard

Defined in: [packages/backend/src/auth/auth-context.guard.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/auth-context.guard.ts#L32)

## Implements

- `CanActivate`

## Constructors

### Constructor

> **new AuthContextGuard**(`tokenVerifier`, `principalMapper?`, `tenantResolver?`, `tenantEntitlementPolicy?`): `AuthContextGuard`

Defined in: [packages/backend/src/auth/auth-context.guard.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/auth-context.guard.ts#L35)

#### Parameters

##### tokenVerifier

[`TokenVerifier`](../interfaces/TokenVerifier.md)

##### principalMapper?

[`PrincipalMapper`](../interfaces/PrincipalMapper.md)

##### tenantResolver?

[`TenantResolver`](../interfaces/TenantResolver.md)

##### tenantEntitlementPolicy?

[`TenantEntitlementPolicy`](../interfaces/TenantEntitlementPolicy.md)

#### Returns

`AuthContextGuard`

## Methods

### canActivate()

> **canActivate**(`context`): `Promise`\<`boolean`\>

Defined in: [packages/backend/src/auth/auth-context.guard.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/auth/auth-context.guard.ts#L48)

#### Parameters

##### context

`ExecutionContext`

Current execution context. Provides access to details about
the current request pipeline.

#### Returns

`Promise`\<`boolean`\>

Value indicating whether or not the current request is allowed to
proceed.

#### Implementation of

`CanActivate.canActivate`
