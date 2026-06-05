[**@stynx/feature-flags**](../index.md)

---

[@stynx/feature-flags](../index.md) / FeatureFlagProvider

# Interface: FeatureFlagProvider

Defined in: [types.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/types.ts#L31)

## Methods

### evaluate()

> **evaluate**(`flag`, `context`, `fallback`): `Promise`\<[`FlagEvaluation`](FlagEvaluation.md)\>

Defined in: [types.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/feature-flags/src/types.ts#L32)

#### Parameters

##### flag

`string`

##### context

[`FlagContext`](FlagContext.md)

##### fallback

[`FlagValue`](../type-aliases/FlagValue.md)

#### Returns

`Promise`\<[`FlagEvaluation`](FlagEvaluation.md)\>
