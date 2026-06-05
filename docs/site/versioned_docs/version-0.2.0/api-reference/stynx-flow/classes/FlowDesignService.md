[**@stynx/flow**](../index.md)

---

[@stynx/flow](../index.md) / FlowDesignService

# Class: FlowDesignService

Defined in: [flow-design.service.ts:286](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L286)

## Constructors

### Constructor

> **new FlowDesignService**(`db`, `requestContext`): `FlowDesignService`

Defined in: [flow-design.service.ts:287](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L287)

#### Parameters

##### db

`Database`

##### requestContext

`RequestContext`

#### Returns

`FlowDesignService`

## Methods

### createGraph()

> **createGraph**(`input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:320](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L320)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### createGraphEdge()

> **createGraphEdge**(`graphId`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:412](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L412)

#### Parameters

##### graphId

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### createGraphNode()

> **createGraphNode**(`graphId`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:392](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L392)

#### Parameters

##### graphId

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### createGraphTransitionEffect()

> **createGraphTransitionEffect**(`graphId`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:452](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L452)

#### Parameters

##### graphId

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### createNodeAgentRule()

> **createNodeAgentRule**(`nodeId`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:432](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L432)

#### Parameters

##### nodeId

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### createNodeFormRule()

> **createNodeFormRule**(`nodeId`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:475](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L475)

#### Parameters

##### nodeId

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### createPolicyRule()

> **createPolicyRule**(`policySetId`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:518](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L518)

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

Defined in: [flow-design.service.ts:498](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L498)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### createScope()

> **createScope**(`input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:300](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L300)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deleteAgentRule()

> **deleteAgentRule**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:444](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L444)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deleteEdge()

> **deleteEdge**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:424](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L424)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deleteGraph()

> **deleteGraph**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:328](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L328)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deleteNode()

> **deleteNode**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:404](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L404)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deleteNodeFormRule()

> **deleteNodeFormRule**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:490](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L490)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deletePolicyRule()

> **deletePolicyRule**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:530](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L530)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deletePolicySet()

> **deletePolicySet**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:510](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L510)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deleteScope()

> **deleteScope**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:308](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L308)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### deleteTransitionEffect()

> **deleteTransitionEffect**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:467](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L467)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### exportGraph()

> **exportGraph**(`id`): `Promise`\<[`FlowGraphExportDocument`](../interfaces/FlowGraphExportDocument.md)\>

Defined in: [flow-design.service.ts:583](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L583)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowGraphExportDocument`](../interfaces/FlowGraphExportDocument.md)\>

---

### getAgentRule()

> **getAgentRule**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:440](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L440)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getEdge()

> **getEdge**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:420](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L420)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getGraph()

> **getGraph**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:316](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L316)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getNode()

> **getNode**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:400](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L400)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getNodeFormRule()

> **getNodeFormRule**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:486](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L486)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getPolicyRule()

> **getPolicyRule**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:526](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L526)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getPolicySet()

> **getPolicySet**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:506](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L506)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getScope()

> **getScope**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:296](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L296)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### getTransitionEffect()

> **getTransitionEffect**(`id`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:463](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L463)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### importGraph()

> **importGraph**(`input`): `Promise`\<[`FlowGraphExportDocument`](../interfaces/FlowGraphExportDocument.md)\>

Defined in: [flow-design.service.ts:534](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L534)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<[`FlowGraphExportDocument`](../interfaces/FlowGraphExportDocument.md)\>

---

### listGraphEdges()

> **listGraphEdges**(`graphId`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-design.service.ts:408](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L408)

#### Parameters

##### graphId

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### listGraphNodes()

> **listGraphNodes**(`graphId`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-design.service.ts:388](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L388)

#### Parameters

##### graphId

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### listGraphs()

> **listGraphs**(`scopeId?`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-design.service.ts:312](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L312)

#### Parameters

##### scopeId?

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### listGraphTransitionEffects()

> **listGraphTransitionEffects**(`graphId`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-design.service.ts:448](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L448)

#### Parameters

##### graphId

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### listNodeAgentRules()

> **listNodeAgentRules**(`nodeId`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-design.service.ts:428](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L428)

#### Parameters

##### nodeId

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### listNodeFormRules()

> **listNodeFormRules**(`nodeId`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-design.service.ts:471](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L471)

#### Parameters

##### nodeId

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### listPolicyRules()

> **listPolicyRules**(`policySetId`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-design.service.ts:514](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L514)

#### Parameters

##### policySetId

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### listPolicySets()

> **listPolicySets**(`scopeId?`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-design.service.ts:494](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L494)

#### Parameters

##### scopeId?

`string`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### listScopes()

> **listScopes**(): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [flow-design.service.ts:292](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L292)

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

---

### publishGraph()

> **publishGraph**(`id`, `input?`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:332](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L332)

#### Parameters

##### id

`string`

##### input?

`unknown` = `{}`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### updateAgentRule()

> **updateAgentRule**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:436](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L436)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### updateEdge()

> **updateEdge**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:416](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L416)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### updateGraph()

> **updateGraph**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:324](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L324)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### updateNode()

> **updateNode**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:396](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L396)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### updateNodeFormRule()

> **updateNodeFormRule**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:482](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L482)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### updatePolicyRule()

> **updatePolicyRule**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:522](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L522)

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

Defined in: [flow-design.service.ts:502](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L502)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### updateScope()

> **updateScope**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:304](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L304)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

---

### updateTransitionEffect()

> **updateTransitionEffect**(`id`, `input`): `Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [flow-design.service.ts:459](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-design.service.ts#L459)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<[`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>
