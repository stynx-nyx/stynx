[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / AuthorizationGuard

# Class: AuthorizationGuard

Defined in: [packages/backend/src/authorization/authorization.guard.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/authorization/authorization.guard.ts#L10)

## Implements

- `CanActivate`

## Constructors

### Constructor

> **new AuthorizationGuard**(`reflector`, `evaluator?`): `AuthorizationGuard`

Defined in: [packages/backend/src/authorization/authorization.guard.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/authorization/authorization.guard.ts#L13)

#### Parameters

##### reflector

`Reflector`

##### evaluator?

[`PolicyEvaluator`](../interfaces/PolicyEvaluator.md)

#### Returns

`AuthorizationGuard`

## Methods

### canActivate()

> **canActivate**(`context`): `Promise`\<`boolean`\>

Defined in: [packages/backend/src/authorization/authorization.guard.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/authorization/authorization.guard.ts#L21)

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
