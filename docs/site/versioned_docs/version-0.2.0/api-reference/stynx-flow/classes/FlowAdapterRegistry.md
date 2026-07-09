[**@stynx-nyx/flow**](../index.md)

---

[@stynx-nyx/flow](../index.md) / FlowAdapterRegistry

# Class: FlowAdapterRegistry

Defined in: [adapters.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L53)

## Constructors

### Constructor

> **new FlowAdapterRegistry**(`adapters`): `FlowAdapterRegistry`

Defined in: [adapters.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L56)

#### Parameters

##### adapters

[`FlowDomainAdapter`](../interfaces/FlowDomainAdapter.md)[] \| `undefined`

#### Returns

`FlowAdapterRegistry`

## Methods

### applyEffect()

> **applyEffect**(`input`): `Promise`\<[`FlowEffectResult`](../interfaces/FlowEffectResult.md)\>

Defined in: [adapters.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L83)

#### Parameters

##### input

[`FlowEffectInput`](../interfaces/FlowEffectInput.md)

#### Returns

`Promise`\<[`FlowEffectResult`](../interfaces/FlowEffectResult.md)\>

---

### buildFacts()

> **buildFacts**(`input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [adapters.ts:70](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L70)

#### Parameters

##### input

[`FlowFactsInput`](../interfaces/FlowFactsInput.md)

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### canManage()

> **canManage**(`input`): `Promise`\<`boolean`\>

Defined in: [adapters.ts:113](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L113)

#### Parameters

##### input

[`FlowAccessInput`](../interfaces/FlowAccessInput.md)

#### Returns

`Promise`\<`boolean`\>

---

### canView()

> **canView**(`input`): `Promise`\<`boolean`\>

Defined in: [adapters.ts:100](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L100)

#### Parameters

##### input

[`FlowAccessInput`](../interfaces/FlowAccessInput.md)

#### Returns

`Promise`\<`boolean`\>

---

### get()

> **get**(`key`): [`FlowDomainAdapter`](../interfaces/FlowDomainAdapter.md) \| `undefined`

Defined in: [adapters.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L66)

#### Parameters

##### key

`string`

#### Returns

[`FlowDomainAdapter`](../interfaces/FlowDomainAdapter.md) \| `undefined`

---

### resolveAgents()

> **resolveAgents**(`input`): `Promise`\<[`FlowResolvedAgent`](../interfaces/FlowResolvedAgent.md)[]\>

Defined in: [adapters.ts:126](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L126)

#### Parameters

##### input

[`FlowAgentResolutionInput`](../interfaces/FlowAgentResolutionInput.md)

#### Returns

`Promise`\<[`FlowResolvedAgent`](../interfaces/FlowResolvedAgent.md)[]\>
