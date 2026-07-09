[**@stynx-nyx/feature-flags**](../index.md)

---

[@stynx-nyx/feature-flags](../index.md) / JsonFileFeatureFlagProvider

# Class: JsonFileFeatureFlagProvider

Defined in: [index.ts:76](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L76)

## Implements

- [`FeatureFlagProvider`](../interfaces/FeatureFlagProvider.md)

## Constructors

### Constructor

> **new JsonFileFeatureFlagProvider**(`path`): `JsonFileFeatureFlagProvider`

Defined in: [index.ts:77](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L77)

#### Parameters

##### path

`string`

#### Returns

`JsonFileFeatureFlagProvider`

## Methods

### evaluate()

> **evaluate**(`flag`, `context`, `fallback`): `Promise`\<[`FlagEvaluation`](../interfaces/FlagEvaluation.md)\>

Defined in: [index.ts:79](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L79)

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
