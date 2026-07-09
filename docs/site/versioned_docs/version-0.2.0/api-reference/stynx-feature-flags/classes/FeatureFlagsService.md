[**@stynx-nyx/feature-flags**](../index.md)

---

[@stynx-nyx/feature-flags](../index.md) / FeatureFlagsService

# Class: FeatureFlagsService

Defined in: [index.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L87)

## Constructors

### Constructor

> **new FeatureFlagsService**(`provider?`): `FeatureFlagsService`

Defined in: [index.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L88)

#### Parameters

##### provider?

[`FeatureFlagProvider`](../interfaces/FeatureFlagProvider.md) = `...`

#### Returns

`FeatureFlagsService`

## Methods

### evaluate()

> **evaluate**(`flag`, `context?`, `fallback?`): `Promise`\<[`FlagEvaluation`](../interfaces/FlagEvaluation.md)\>

Defined in: [index.ts:90](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L90)

#### Parameters

##### flag

`string`

##### context?

[`FlagContext`](../interfaces/FlagContext.md) = `{}`

##### fallback?

[`FlagValue`](../type-aliases/FlagValue.md) = `false`

#### Returns

`Promise`\<[`FlagEvaluation`](../interfaces/FlagEvaluation.md)\>

---

### isEnabled()

> **isEnabled**(`flag`, `context?`, `fallback?`): `Promise`\<`boolean`\>

Defined in: [index.ts:98](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L98)

#### Parameters

##### flag

`string`

##### context?

[`FlagContext`](../interfaces/FlagContext.md) = `{}`

##### fallback?

`boolean` = `false`

#### Returns

`Promise`\<`boolean`\>

---

### variant()

> **variant**(`flag`, `context?`, `fallback?`): `Promise`\<`string`\>

Defined in: [index.ts:103](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/index.ts#L103)

#### Parameters

##### flag

`string`

##### context?

[`FlagContext`](../interfaces/FlagContext.md) = `{}`

##### fallback?

`string` = `'default'`

#### Returns

`Promise`\<`string`\>
