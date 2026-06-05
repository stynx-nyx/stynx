[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / PermissionGuard

# Class: PermissionGuard

Defined in: [permission.guard.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission.guard.ts#L12)

## Implements

- `CanActivate`

## Constructors

### Constructor

> **new PermissionGuard**(`reflector`): `PermissionGuard`

Defined in: [permission.guard.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission.guard.ts#L13)

#### Parameters

##### reflector

`Reflector`

#### Returns

`PermissionGuard`

## Methods

### canActivate()

> **canActivate**(`context`): `boolean`

Defined in: [permission.guard.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission.guard.ts#L15)

#### Parameters

##### context

`ExecutionContext`

Current execution context. Provides access to details about
the current request pipeline.

#### Returns

`boolean`

Value indicating whether or not the current request is allowed to
proceed.

#### Implementation of

`CanActivate.canActivate`
