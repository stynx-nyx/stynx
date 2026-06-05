[**@stynx/ratelimit**](../index.md)

---

[@stynx/ratelimit](../index.md) / RateLimitGuard

# Class: RateLimitGuard

Defined in: [rate-limit.guard.ts:93](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit.guard.ts#L93)

## Implements

- `CanActivate`

## Constructors

### Constructor

> **new RateLimitGuard**(`reflector`, `options?`, `store?`, `policyResolver?`, `metrics?`): `RateLimitGuard`

Defined in: [rate-limit.guard.ts:96](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit.guard.ts#L96)

#### Parameters

##### reflector

`Reflector`

##### options?

[`RateLimitGuardOptions`](../interfaces/RateLimitGuardOptions.md) = `{}`

##### store?

[`RateLimitStore`](../interfaces/RateLimitStore.md)

##### policyResolver?

[`RateLimitPolicyResolver`](../interfaces/RateLimitPolicyResolver.md)

##### metrics?

[`RateLimitMetricsSink`](../interfaces/RateLimitMetricsSink.md)

#### Returns

`RateLimitGuard`

## Methods

### canActivate()

> **canActivate**(`context`): `Promise`\<`boolean`\>

Defined in: [rate-limit.guard.ts:116](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/ratelimit/src/rate-limit.guard.ts#L116)

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
