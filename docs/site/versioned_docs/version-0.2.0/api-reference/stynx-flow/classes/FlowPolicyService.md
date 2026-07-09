[**@stynx-nyx/flow**](../index.md)

---

[@stynx-nyx/flow](../index.md) / FlowPolicyService

# Class: FlowPolicyService

Defined in: [flow-policy.service.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L8)

## Constructors

### Constructor

> **new FlowPolicyService**(`design`, `db`): `FlowPolicyService`

Defined in: [flow-policy.service.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L9)

#### Parameters

##### design

[`FlowDesignService`](FlowDesignService.md)

##### db

`Database`

#### Returns

`FlowPolicyService`

## Methods

### createPolicyRule()

> **createPolicyRule**(`policySetId`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-policy.service.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L38)

#### Parameters

##### policySetId

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### createPolicySet()

> **createPolicySet**(`input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-policy.service.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L18)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deletePolicyRule()

> **deletePolicyRule**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-policy.service.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L50)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deletePolicySet()

> **deletePolicySet**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-policy.service.ts:30](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L30)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### evaluate()

> **evaluate**(`input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-policy.service.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L54)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getPolicyRule()

> **getPolicyRule**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-policy.service.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L42)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getPolicySet()

> **getPolicySet**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-policy.service.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L22)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### listPolicyRules()

> **listPolicyRules**(`policySetId`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-policy.service.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L34)

#### Parameters

##### policySetId

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### listPolicySets()

> **listPolicySets**(`scopeId?`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-policy.service.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L14)

#### Parameters

##### scopeId?

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### updatePolicyRule()

> **updatePolicyRule**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-policy.service.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L46)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### updatePolicySet()

> **updatePolicySet**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-policy.service.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-policy.service.ts#L26)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>
