[**@stynx-nyx/flow**](../index.md)

---

[@stynx-nyx/flow](../index.md) / FlowDomainAdapter

# Interface: FlowDomainAdapter

Defined in: [adapters.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L43)

## Properties

### key

> `readonly` **key**: `string`

Defined in: [adapters.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L44)

## Methods

### applyEffect()

> **applyEffect**(`input`): `Promise`\<[`FlowEffectResult`](FlowEffectResult.md)\>

Defined in: [adapters.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L46)

#### Parameters

##### input

[`FlowEffectInput`](FlowEffectInput.md)

#### Returns

`Promise`\<[`FlowEffectResult`](FlowEffectResult.md)\>

---

### buildFacts()

> **buildFacts**(`input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [adapters.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L45)

#### Parameters

##### input

[`FlowFactsInput`](FlowFactsInput.md)

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### canManage()

> **canManage**(`input`): `Promise`\<`boolean`\>

Defined in: [adapters.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L48)

#### Parameters

##### input

[`FlowAccessInput`](FlowAccessInput.md)

#### Returns

`Promise`\<`boolean`\>

---

### canView()

> **canView**(`input`): `Promise`\<`boolean`\>

Defined in: [adapters.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L47)

#### Parameters

##### input

[`FlowAccessInput`](FlowAccessInput.md)

#### Returns

`Promise`\<`boolean`\>

---

### resolveAgents()?

> `optional` **resolveAgents**(`input`): `Promise`\<[`FlowResolvedAgent`](FlowResolvedAgent.md)[]\>

Defined in: [adapters.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/adapters.ts#L49)

#### Parameters

##### input

[`FlowAgentResolutionInput`](FlowAgentResolutionInput.md)

#### Returns

`Promise`\<[`FlowResolvedAgent`](FlowResolvedAgent.md)[]\>
