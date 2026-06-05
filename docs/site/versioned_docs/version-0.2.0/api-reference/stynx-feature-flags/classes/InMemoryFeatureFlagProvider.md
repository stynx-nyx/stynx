[**@stynx/feature-flags**](../index.md)

---

[@stynx/feature-flags](../index.md) / InMemoryFeatureFlagProvider

# Class: InMemoryFeatureFlagProvider

Defined in: [index.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L67)

## Implements

- [`FeatureFlagProvider`](../interfaces/FeatureFlagProvider.md)

## Constructors

### Constructor

> **new InMemoryFeatureFlagProvider**(`flagSet?`): `InMemoryFeatureFlagProvider`

Defined in: [index.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L68)

#### Parameters

##### flagSet?

[`FlagSet`](../interfaces/FlagSet.md) = `...`

#### Returns

`InMemoryFeatureFlagProvider`

## Methods

### evaluate()

> **evaluate**(`flag`, `context`, `fallback`): `Promise`\<[`FlagEvaluation`](../interfaces/FlagEvaluation.md)\>

Defined in: [index.ts:70](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L70)

#### Parameters

##### flag

`string`

##### context

[`FlagContext`](../interfaces/FlagContext.md)

##### fallback

[`FlagValue`](../type-aliases/FlagValue.md)

#### Returns

`Promise`\<[`FlagEvaluation`](../interfaces/FlagEvaluation.md)\>

#### Implementation of

[`FeatureFlagProvider`](../interfaces/FeatureFlagProvider.md).[`evaluate`](../interfaces/FeatureFlagProvider.md#evaluate)
