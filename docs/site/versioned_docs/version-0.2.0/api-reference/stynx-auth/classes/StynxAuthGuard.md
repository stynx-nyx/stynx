[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / StynxAuthGuard

# Class: StynxAuthGuard

Defined in: [stynx-auth.guard.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/stynx-auth.guard.ts#L26)

## Implements

- `CanActivate`

## Constructors

### Constructor

> **new StynxAuthGuard**(`moduleRef`, `reflector`, `validator`, `permissionCache`): `StynxAuthGuard`

Defined in: [stynx-auth.guard.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/stynx-auth.guard.ts#L27)

#### Parameters

##### moduleRef

`ModuleRef`

##### reflector

`Reflector`

##### validator

[`StynxJwtValidator`](StynxJwtValidator.md)

##### permissionCache

[`PermissionCache`](PermissionCache.md)

#### Returns

`StynxAuthGuard`

## Methods

### canActivate()

> **canActivate**(`context`): `Promise`\<`boolean`\>

Defined in: [stynx-auth.guard.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/stynx-auth.guard.ts#L34)

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
