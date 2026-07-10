[**@stynx-nyx/angular-flow**](../index.md)

---

[@stynx-nyx/angular-flow](../index.md) / FlowApiService

# Class: FlowApiService

Defined in: [flow-api.service.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L63)

## Constructors

### Constructor

> **new FlowApiService**(): `FlowApiService`

#### Returns

`FlowApiService`

## Methods

### acceptTask()

> **acceptTask**(`taskId`, `note?`): `Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-api.service.ts:280](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L280)

#### Parameters

##### taskId

`string`

##### note?

`string`

#### Returns

`Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

---

### actTask()

> **actTask**(`taskId`, `action`, `note?`): `Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-api.service.ts:276](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L276)

#### Parameters

##### taskId

`string`

##### action

`string`

##### note?

`string`

#### Returns

`Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

---

### assignTask()

> **assignTask**(`taskId`, `userId`, `note?`): `Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-api.service.ts:296](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L296)

#### Parameters

##### taskId

`string`

##### userId

`string`

##### note?

`string`

#### Returns

`Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

---

### bulkUpsertAnswers()

> **bulkUpsertAnswers**(`fillId`, `input`): `Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)[]\>

Defined in: [flow-api.service.ts:392](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L392)

#### Parameters

##### fillId

`string`

##### input

`Partial`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)\>[]

#### Returns

`Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)[]\>

---

### createFill()

> **createFill**(`formId`, `input`): `Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

Defined in: [flow-api.service.ts:364](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L364)

#### Parameters

##### formId

`string`

##### input

`Partial`\<[`FlowFill`](../interfaces/FlowFill.md)\>

#### Returns

`Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

---

### createFillAlias()

> **createFillAlias**(`input`): `Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

Defined in: [flow-api.service.ts:368](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L368)

#### Parameters

##### input

`Partial`\<[`FlowFill`](../interfaces/FlowFill.md)\> & `object`

#### Returns

`Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

---

### createForm()

> **createForm**(`input`): `Promise`\<[`FlowForm`](../interfaces/FlowForm.md)\>

Defined in: [flow-api.service.ts:312](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L312)

#### Parameters

##### input

`Partial`\<[`FlowForm`](../interfaces/FlowForm.md)\>

#### Returns

`Promise`\<[`FlowForm`](../interfaces/FlowForm.md)\>

---

### createFormFillWaiver()

> **createFormFillWaiver**(`formId`, `fillId`, `input`): `Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

Defined in: [flow-api.service.ts:420](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L420)

#### Parameters

##### formId

`string`

##### fillId

`string`

##### input

`Partial`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

#### Returns

`Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

---

### createGraph()

> **createGraph**(`input`): `Promise`\<[`FlowGraph`](../interfaces/FlowGraph.md)\>

Defined in: [flow-api.service.ts:102](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L102)

#### Parameters

##### input

`Partial`\<[`FlowGraph`](../interfaces/FlowGraph.md)\>

#### Returns

`Promise`\<[`FlowGraph`](../interfaces/FlowGraph.md)\>

---

### createGraphEdge()

> **createGraphEdge**(`graphId`, `input`): `Promise`\<[`FlowEdge`](../interfaces/FlowEdge.md)\>

Defined in: [flow-api.service.ts:146](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L146)

#### Parameters

##### graphId

`string`

##### input

`Partial`\<[`FlowEdge`](../interfaces/FlowEdge.md)\>

#### Returns

`Promise`\<[`FlowEdge`](../interfaces/FlowEdge.md)\>

---

### createGraphNode()

> **createGraphNode**(`graphId`, `input`): `Promise`\<[`FlowNode`](../interfaces/FlowNode.md)\>

Defined in: [flow-api.service.ts:130](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L130)

#### Parameters

##### graphId

`string`

##### input

`Partial`\<[`FlowNode`](../interfaces/FlowNode.md)\>

#### Returns

`Promise`\<[`FlowNode`](../interfaces/FlowNode.md)\>

---

### createGraphTransitionEffect()

> **createGraphTransitionEffect**(`graphId`, `input`): `Promise`\<[`FlowTransitionEffect`](../interfaces/FlowTransitionEffect.md)\>

Defined in: [flow-api.service.ts:194](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L194)

#### Parameters

##### graphId

`string`

##### input

`Partial`\<[`FlowTransitionEffect`](../interfaces/FlowTransitionEffect.md)\>

#### Returns

`Promise`\<[`FlowTransitionEffect`](../interfaces/FlowTransitionEffect.md)\>

---

### createNodeAgentRule()

> **createNodeAgentRule**(`nodeId`, `input`): `Promise`\<[`FlowAgentRule`](../interfaces/FlowAgentRule.md)\>

Defined in: [flow-api.service.ts:162](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L162)

#### Parameters

##### nodeId

`string`

##### input

`Partial`\<[`FlowAgentRule`](../interfaces/FlowAgentRule.md)\>

#### Returns

`Promise`\<[`FlowAgentRule`](../interfaces/FlowAgentRule.md)\>

---

### createNodeFormRule()

> **createNodeFormRule**(`nodeId`, `input`): `Promise`\<[`FlowNodeFormRule`](../interfaces/FlowNodeFormRule.md)\>

Defined in: [flow-api.service.ts:178](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L178)

#### Parameters

##### nodeId

`string`

##### input

`Partial`\<[`FlowNodeFormRule`](../interfaces/FlowNodeFormRule.md)\>

#### Returns

`Promise`\<[`FlowNodeFormRule`](../interfaces/FlowNodeFormRule.md)\>

---

### createPolicyRule()

> **createPolicyRule**(`policySetId`, `input`): `Promise`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)\>

Defined in: [flow-api.service.ts:484](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L484)

#### Parameters

##### policySetId

`string`

##### input

`Partial`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)\>

#### Returns

`Promise`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)\>

---

### createPolicySet()

> **createPolicySet**(`input`): `Promise`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)\>

Defined in: [flow-api.service.ts:464](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L464)

#### Parameters

##### input

`Partial`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)\>

#### Returns

`Promise`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)\>

---

### createQuestion()

> **createQuestion**(`formId`, `input`): `Promise`\<[`FlowQuestion`](../interfaces/FlowQuestion.md)\>

Defined in: [flow-api.service.ts:328](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L328)

#### Parameters

##### formId

`string`

##### input

`Partial`\<[`FlowQuestion`](../interfaces/FlowQuestion.md)\>

#### Returns

`Promise`\<[`FlowQuestion`](../interfaces/FlowQuestion.md)\>

---

### createScope()

> **createScope**(`input`): `Promise`\<[`FlowScope`](../interfaces/FlowScope.md)\>

Defined in: [flow-api.service.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L74)

#### Parameters

##### input

`Partial`\<[`FlowScope`](../interfaces/FlowScope.md)\>

#### Returns

`Promise`\<[`FlowScope`](../interfaces/FlowScope.md)\>

---

### createWaiver()

> **createWaiver**(`input`): `Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

Defined in: [flow-api.service.ts:408](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L408)

#### Parameters

##### input

`Partial`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

#### Returns

`Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

---

### dashboardAnalytics()

> **dashboardAnalytics**(`filters?`): `Promise`\<[`FlowDashboardAnalytics`](../interfaces/FlowDashboardAnalytics.md)\>

Defined in: [flow-api.service.ts:452](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L452)

#### Parameters

##### filters?

###### graphId?

`string`

###### scopeCode?

`string`

###### scopeId?

`string`

#### Returns

`Promise`\<[`FlowDashboardAnalytics`](../interfaces/FlowDashboardAnalytics.md)\>

---

### declineTask()

> **declineTask**(`taskId`, `note?`): `Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-api.service.ts:284](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L284)

#### Parameters

##### taskId

`string`

##### note?

`string`

#### Returns

`Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

---

### deleteAgentRule()

> **deleteAgentRule**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:170](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L170)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteAnswer()

> **deleteAnswer**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:400](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L400)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteEdge()

> **deleteEdge**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:154](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L154)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteFill()

> **deleteFill**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:376](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L376)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteForm()

> **deleteForm**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:320](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L320)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteGraph()

> **deleteGraph**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:122](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L122)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteNode()

> **deleteNode**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:138](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L138)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteNodeFormRule()

> **deleteNodeFormRule**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:186](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L186)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deletePolicyRule()

> **deletePolicyRule**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:492](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L492)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deletePolicySet()

> **deletePolicySet**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:472](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L472)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteQuestion()

> **deleteQuestion**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:336](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L336)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteQuestionScore()

> **deleteQuestionScore**(`questionId`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:348](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L348)

#### Parameters

##### questionId

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteScope()

> **deleteScope**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L82)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteTransitionEffect()

> **deleteTransitionEffect**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:202](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L202)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### deleteWaiver()

> **deleteWaiver**(`id`): `Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

Defined in: [flow-api.service.ts:428](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L428)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<\{ `deleted`: `boolean`; `id`: `string`; \}\>

---

### dispatchEffects()

> **dispatchEffects**(`input`): `Promise`\<[`FlowEffectDispatchSummary`](../interfaces/FlowEffectDispatchSummary.md)\>

Defined in: [flow-api.service.ts:440](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L440)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<[`FlowEffectDispatchSummary`](../interfaces/FlowEffectDispatchSummary.md)\>

---

### ensureRun()

> **ensureRun**(`input`): `Promise`\<\{ `runId`: `string`; \}\>

Defined in: [flow-api.service.ts:210](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L210)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<\{ `runId`: `string`; \}\>

---

### evaluatePolicy()

> **evaluatePolicy**(`input`): `Promise`\<[`FlowPolicyDecision`](../interfaces/FlowPolicyDecision.md)\>

Defined in: [flow-api.service.ts:496](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L496)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<[`FlowPolicyDecision`](../interfaces/FlowPolicyDecision.md)\>

---

### exportGraph()

> **exportGraph**(`id`): `Promise`\<[`FlowGraphExport`](../interfaces/FlowGraphExport.md)\>

Defined in: [flow-api.service.ts:94](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L94)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowGraphExport`](../interfaces/FlowGraphExport.md)\>

---

### getFill()

> **getFill**(`id`): `Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

Defined in: [flow-api.service.ts:356](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L356)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

---

### getForm()

> **getForm**(`id`): `Promise`\<[`FlowForm`](../interfaces/FlowForm.md)\>

Defined in: [flow-api.service.ts:308](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L308)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowForm`](../interfaces/FlowForm.md)\>

---

### getFormFill()

> **getFormFill**(`formId`, `fillId`): `Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

Defined in: [flow-api.service.ts:360](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L360)

#### Parameters

##### formId

`string`

##### fillId

`string`

#### Returns

`Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

---

### getGraph()

> **getGraph**(`id`): `Promise`\<[`FlowGraph`](../interfaces/FlowGraph.md)\>

Defined in: [flow-api.service.ts:90](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L90)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowGraph`](../interfaces/FlowGraph.md)\>

---

### getNodeRun()

> **getNodeRun**(`id`): `Promise`\<[`FlowNodeRun`](../interfaces/FlowNodeRun.md)\>

Defined in: [flow-api.service.ts:246](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L246)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowNodeRun`](../interfaces/FlowNodeRun.md)\>

---

### getPolicyRule()

> **getPolicyRule**(`id`): `Promise`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)\>

Defined in: [flow-api.service.ts:480](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L480)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)\>

---

### getPolicySet()

> **getPolicySet**(`id`): `Promise`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)\>

Defined in: [flow-api.service.ts:460](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L460)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)\>

---

### getQuestionScore()

> **getQuestionScore**(`questionId`): `Promise`\<[`FlowScore`](../interfaces/FlowScore.md)\>

Defined in: [flow-api.service.ts:340](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L340)

#### Parameters

##### questionId

`string`

#### Returns

`Promise`\<[`FlowScore`](../interfaces/FlowScore.md)\>

---

### getRun()

> **getRun**(`id`): `Promise`\<[`FlowRun`](../interfaces/FlowRun.md)\>

Defined in: [flow-api.service.ts:214](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L214)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowRun`](../interfaces/FlowRun.md)\>

---

### getRunFacts()

> **getRunFacts**(`runId`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-api.service.ts:238](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L238)

#### Parameters

##### runId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getScope()

> **getScope**(`id`): `Promise`\<[`FlowScope`](../interfaces/FlowScope.md)\>

Defined in: [flow-api.service.ts:70](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L70)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowScope`](../interfaces/FlowScope.md)\>

---

### getTask()

> **getTask**(`id`): `Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-api.service.ts:260](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L260)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

---

### importGraph()

> **importGraph**(`input`): `Promise`\<[`FlowGraphExport`](../interfaces/FlowGraphExport.md)\>

Defined in: [flow-api.service.ts:98](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L98)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<[`FlowGraphExport`](../interfaces/FlowGraphExport.md)\>

---

### listAnswers()

> **listAnswers**(`fillId`): `Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)[]\>

Defined in: [flow-api.service.ts:380](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L380)

#### Parameters

##### fillId

`string`

#### Returns

`Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)[]\>

---

### listEvents()

> **listEvents**(`filters?`): `Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowEvent`](../interfaces/FlowEvent.md)\>\>

Defined in: [flow-api.service.ts:432](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L432)

#### Parameters

##### filters?

###### actorId?

`string`

###### kind?

`string`

###### nodeId?

`string`

###### runId?

`string`

###### taskId?

`string`

#### Returns

`Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowEvent`](../interfaces/FlowEvent.md)\>\>

---

### listFills()

> **listFills**(`filters?`): `Promise`\<[`FlowFill`](../interfaces/FlowFill.md)[]\>

Defined in: [flow-api.service.ts:352](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L352)

#### Parameters

##### filters?

###### formId?

`string`

###### runId?

`string`

###### scopeId?

`string`

###### targetId?

`string`

###### targetType?

`string`

###### taskId?

`string`

#### Returns

`Promise`\<[`FlowFill`](../interfaces/FlowFill.md)[]\>

---

### listFillWaivers()

> **listFillWaivers**(`fillId`): `Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)[]\>

Defined in: [flow-api.service.ts:416](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L416)

#### Parameters

##### fillId

`string`

#### Returns

`Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)[]\>

---

### listFormFillAnswers()

> **listFormFillAnswers**(`formId`, `fillId`): `Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)[]\>

Defined in: [flow-api.service.ts:384](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L384)

#### Parameters

##### formId

`string`

##### fillId

`string`

#### Returns

`Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)[]\>

---

### listFormFillWaivers()

> **listFormFillWaivers**(`formId`, `fillId`): `Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)[]\>

Defined in: [flow-api.service.ts:412](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L412)

#### Parameters

##### formId

`string`

##### fillId

`string`

#### Returns

`Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)[]\>

---

### listForms()

> **listForms**(`scopeId?`): `Promise`\<[`FlowForm`](../interfaces/FlowForm.md)[]\>

Defined in: [flow-api.service.ts:304](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L304)

#### Parameters

##### scopeId?

`string`

#### Returns

`Promise`\<[`FlowForm`](../interfaces/FlowForm.md)[]\>

---

### listGraphEdges()

> **listGraphEdges**(`graphId`): `Promise`\<[`FlowEdge`](../interfaces/FlowEdge.md)[]\>

Defined in: [flow-api.service.ts:142](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L142)

#### Parameters

##### graphId

`string`

#### Returns

`Promise`\<[`FlowEdge`](../interfaces/FlowEdge.md)[]\>

---

### listGraphNodes()

> **listGraphNodes**(`graphId`): `Promise`\<[`FlowNode`](../interfaces/FlowNode.md)[]\>

Defined in: [flow-api.service.ts:126](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L126)

#### Parameters

##### graphId

`string`

#### Returns

`Promise`\<[`FlowNode`](../interfaces/FlowNode.md)[]\>

---

### listGraphs()

> **listGraphs**(`scopeId?`): `Promise`\<[`FlowGraph`](../interfaces/FlowGraph.md)[]\>

Defined in: [flow-api.service.ts:86](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L86)

#### Parameters

##### scopeId?

`string`

#### Returns

`Promise`\<[`FlowGraph`](../interfaces/FlowGraph.md)[]\>

---

### listGraphTransitionEffects()

> **listGraphTransitionEffects**(`graphId`): `Promise`\<[`FlowTransitionEffect`](../interfaces/FlowTransitionEffect.md)[]\>

Defined in: [flow-api.service.ts:190](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L190)

#### Parameters

##### graphId

`string`

#### Returns

`Promise`\<[`FlowTransitionEffect`](../interfaces/FlowTransitionEffect.md)[]\>

---

### listNodeAgentRules()

> **listNodeAgentRules**(`nodeId`): `Promise`\<[`FlowAgentRule`](../interfaces/FlowAgentRule.md)[]\>

Defined in: [flow-api.service.ts:158](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L158)

#### Parameters

##### nodeId

`string`

#### Returns

`Promise`\<[`FlowAgentRule`](../interfaces/FlowAgentRule.md)[]\>

---

### listNodeFormRules()

> **listNodeFormRules**(`nodeId`): `Promise`\<[`FlowNodeFormRule`](../interfaces/FlowNodeFormRule.md)[]\>

Defined in: [flow-api.service.ts:174](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L174)

#### Parameters

##### nodeId

`string`

#### Returns

`Promise`\<[`FlowNodeFormRule`](../interfaces/FlowNodeFormRule.md)[]\>

---

### listNodeRuns()

> **listNodeRuns**(`filters?`): `Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowNodeRun`](../interfaces/FlowNodeRun.md)\>\>

Defined in: [flow-api.service.ts:242](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L242)

#### Parameters

##### filters?

###### runId?

`string`

###### status?

`string`

#### Returns

`Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowNodeRun`](../interfaces/FlowNodeRun.md)\>\>

---

### listPolicyRules()

> **listPolicyRules**(`policySetId`): `Promise`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)[]\>

Defined in: [flow-api.service.ts:476](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L476)

#### Parameters

##### policySetId

`string`

#### Returns

`Promise`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)[]\>

---

### listPolicySets()

> **listPolicySets**(`scopeId?`): `Promise`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)[]\>

Defined in: [flow-api.service.ts:456](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L456)

#### Parameters

##### scopeId?

`string`

#### Returns

`Promise`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)[]\>

---

### listQuestions()

> **listQuestions**(`formId`): `Promise`\<[`FlowQuestion`](../interfaces/FlowQuestion.md)[]\>

Defined in: [flow-api.service.ts:324](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L324)

#### Parameters

##### formId

`string`

#### Returns

`Promise`\<[`FlowQuestion`](../interfaces/FlowQuestion.md)[]\>

---

### listRunActivity()

> **listRunActivity**(`runId`, `filters?`): `Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowEvent`](../interfaces/FlowEvent.md)\>\>

Defined in: [flow-api.service.ts:234](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L234)

#### Parameters

##### runId

`string`

##### filters?

###### cursor?

`string`

###### page?

`number`

###### pageSize?

`number`

#### Returns

`Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowEvent`](../interfaces/FlowEvent.md)\>\>

---

### listRunEvents()

> **listRunEvents**(`runId`): `Promise`\<[`FlowEvent`](../interfaces/FlowEvent.md)[]\>

Defined in: [flow-api.service.ts:230](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L230)

#### Parameters

##### runId

`string`

#### Returns

`Promise`\<[`FlowEvent`](../interfaces/FlowEvent.md)[]\>

---

### listRunNodeRuns()

> **listRunNodeRuns**(`runId`): `Promise`\<[`FlowNodeRun`](../interfaces/FlowNodeRun.md)[]\>

Defined in: [flow-api.service.ts:222](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L222)

#### Parameters

##### runId

`string`

#### Returns

`Promise`\<[`FlowNodeRun`](../interfaces/FlowNodeRun.md)[]\>

---

### listRuns()

> **listRuns**(`filters?`): `Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowRun`](../interfaces/FlowRun.md)\>\>

Defined in: [flow-api.service.ts:206](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L206)

#### Parameters

##### filters?

###### graphId?

`string`

###### scopeId?

`string`

###### status?

`string`

###### targetId?

`string`

###### targetType?

`string`

#### Returns

`Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowRun`](../interfaces/FlowRun.md)\>\>

---

### listRunTasks()

> **listRunTasks**(`runId`): `Promise`\<[`FlowTask`](../interfaces/FlowTask.md)[]\>

Defined in: [flow-api.service.ts:226](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L226)

#### Parameters

##### runId

`string`

#### Returns

`Promise`\<[`FlowTask`](../interfaces/FlowTask.md)[]\>

---

### listScopes()

> **listScopes**(): `Promise`\<[`FlowScope`](../interfaces/FlowScope.md)[]\>

Defined in: [flow-api.service.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L66)

#### Returns

`Promise`\<[`FlowScope`](../interfaces/FlowScope.md)[]\>

---

### listTasks()

> **listTasks**(`filters?`): `Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowTask`](../interfaces/FlowTask.md)\>\>

Defined in: [flow-api.service.ts:250](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L250)

#### Parameters

##### filters?

`FlowTaskFilters` = `{}`

#### Returns

`Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowTask`](../interfaces/FlowTask.md)\>\>

---

### listWaivers()

> **listWaivers**(`filters?`): `Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)[]\>

Defined in: [flow-api.service.ts:404](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L404)

#### Parameters

##### filters?

###### formId?

`string`

###### questionId?

`string`

###### scopeId?

`string`

###### targetId?

`string`

###### targetType?

`string`

#### Returns

`Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)[]\>

---

### openTasks()

> **openTasks**(`filters?`): `Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowOpenTask`](../interfaces/FlowOpenTask.md)\>\>

Defined in: [flow-api.service.ts:444](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L444)

#### Parameters

##### filters?

###### graphId?

`string`

###### page?

`number`

###### pageSize?

`number`

###### scopeCode?

`string`

###### scopeId?

`string`

###### status?

`string`

#### Returns

`Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowOpenTask`](../interfaces/FlowOpenTask.md)\>\>

---

### publishGraph()

> **publishGraph**(`id`, `input?`, `idempotencyKey?`): `Promise`\<[`PublishFlowGraphResponse`](../interfaces/PublishFlowGraphResponse.md)\>

Defined in: [flow-api.service.ts:110](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L110)

#### Parameters

##### id

`string`

##### input?

[`PublishFlowGraphRequest`](../interfaces/PublishFlowGraphRequest.md) = `{}`

##### idempotencyKey?

`string`

#### Returns

`Promise`\<[`PublishFlowGraphResponse`](../interfaces/PublishFlowGraphResponse.md)\>

---

### putQuestionScore()

> **putQuestionScore**(`questionId`, `input`): `Promise`\<[`FlowScore`](../interfaces/FlowScore.md)\>

Defined in: [flow-api.service.ts:344](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L344)

#### Parameters

##### questionId

`string`

##### input

`Partial`\<[`FlowScore`](../interfaces/FlowScore.md)\>

#### Returns

`Promise`\<[`FlowScore`](../interfaces/FlowScore.md)\>

---

### runsSummary()

> **runsSummary**(`filters?`): `Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowRunSummary`](../interfaces/FlowRunSummary.md)\>\>

Defined in: [flow-api.service.ts:448](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L448)

#### Parameters

##### filters?

###### graphId?

`string`

###### page?

`number`

###### pageSize?

`number`

###### scopeCode?

`string`

###### scopeId?

`string`

###### status?

`string`

#### Returns

`Promise`\<[`FlowPage`](../interfaces/FlowPage.md)\<[`FlowRunSummary`](../interfaces/FlowRunSummary.md)\>\>

---

### signal()

> **signal**(`input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-api.service.ts:436](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L436)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### taskCandidates()

> **taskCandidates**(`taskId`): `Promise`\<[`FlowTaskCandidate`](../interfaces/FlowTaskCandidate.md)[]\>

Defined in: [flow-api.service.ts:264](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L264)

#### Parameters

##### taskId

`string`

#### Returns

`Promise`\<[`FlowTaskCandidate`](../interfaces/FlowTaskCandidate.md)[]\>

---

### taskUser()

> **taskUser**(`id`): `Promise`\<[`FlowTaskUser`](../interfaces/FlowTaskUser.md)\>

Defined in: [flow-api.service.ts:272](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L272)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`FlowTaskUser`](../interfaces/FlowTaskUser.md)\>

---

### unacceptTask()

> **unacceptTask**(`taskId`, `note?`): `Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-api.service.ts:288](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L288)

#### Parameters

##### taskId

`string`

##### note?

`string`

#### Returns

`Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

---

### unassignTask()

> **unassignTask**(`taskId`, `note?`): `Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-api.service.ts:300](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L300)

#### Parameters

##### taskId

`string`

##### note?

`string`

#### Returns

`Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

---

### updateAgentRule()

> **updateAgentRule**(`id`, `input`): `Promise`\<[`FlowAgentRule`](../interfaces/FlowAgentRule.md)\>

Defined in: [flow-api.service.ts:166](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L166)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowAgentRule`](../interfaces/FlowAgentRule.md)\>

#### Returns

`Promise`\<[`FlowAgentRule`](../interfaces/FlowAgentRule.md)\>

---

### updateAnswer()

> **updateAnswer**(`id`, `input`): `Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)\>

Defined in: [flow-api.service.ts:396](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L396)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)\>

#### Returns

`Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)\>

---

### updateEdge()

> **updateEdge**(`id`, `input`): `Promise`\<[`FlowEdge`](../interfaces/FlowEdge.md)\>

Defined in: [flow-api.service.ts:150](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L150)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowEdge`](../interfaces/FlowEdge.md)\>

#### Returns

`Promise`\<[`FlowEdge`](../interfaces/FlowEdge.md)\>

---

### updateFill()

> **updateFill**(`id`, `input`): `Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

Defined in: [flow-api.service.ts:372](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L372)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowFill`](../interfaces/FlowFill.md)\>

#### Returns

`Promise`\<[`FlowFill`](../interfaces/FlowFill.md)\>

---

### updateForm()

> **updateForm**(`id`, `input`): `Promise`\<[`FlowForm`](../interfaces/FlowForm.md)\>

Defined in: [flow-api.service.ts:316](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L316)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowForm`](../interfaces/FlowForm.md)\>

#### Returns

`Promise`\<[`FlowForm`](../interfaces/FlowForm.md)\>

---

### updateGraph()

> **updateGraph**(`id`, `input`): `Promise`\<[`FlowGraph`](../interfaces/FlowGraph.md)\>

Defined in: [flow-api.service.ts:106](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L106)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowGraph`](../interfaces/FlowGraph.md)\>

#### Returns

`Promise`\<[`FlowGraph`](../interfaces/FlowGraph.md)\>

---

### updateNode()

> **updateNode**(`id`, `input`): `Promise`\<[`FlowNode`](../interfaces/FlowNode.md)\>

Defined in: [flow-api.service.ts:134](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L134)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowNode`](../interfaces/FlowNode.md)\>

#### Returns

`Promise`\<[`FlowNode`](../interfaces/FlowNode.md)\>

---

### updateNodeFormRule()

> **updateNodeFormRule**(`id`, `input`): `Promise`\<[`FlowNodeFormRule`](../interfaces/FlowNodeFormRule.md)\>

Defined in: [flow-api.service.ts:182](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L182)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowNodeFormRule`](../interfaces/FlowNodeFormRule.md)\>

#### Returns

`Promise`\<[`FlowNodeFormRule`](../interfaces/FlowNodeFormRule.md)\>

---

### updatePolicyRule()

> **updatePolicyRule**(`id`, `input`): `Promise`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)\>

Defined in: [flow-api.service.ts:488](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L488)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)\>

#### Returns

`Promise`\<[`FlowPolicyRule`](../interfaces/FlowPolicyRule.md)\>

---

### updatePolicySet()

> **updatePolicySet**(`id`, `input`): `Promise`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)\>

Defined in: [flow-api.service.ts:468](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L468)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)\>

#### Returns

`Promise`\<[`FlowPolicySet`](../interfaces/FlowPolicySet.md)\>

---

### updateQuestion()

> **updateQuestion**(`id`, `input`): `Promise`\<[`FlowQuestion`](../interfaces/FlowQuestion.md)\>

Defined in: [flow-api.service.ts:332](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L332)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowQuestion`](../interfaces/FlowQuestion.md)\>

#### Returns

`Promise`\<[`FlowQuestion`](../interfaces/FlowQuestion.md)\>

---

### updateRun()

> **updateRun**(`id`, `input`): `Promise`\<[`FlowRun`](../interfaces/FlowRun.md)\>

Defined in: [flow-api.service.ts:218](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L218)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowRun`](../interfaces/FlowRun.md)\>

#### Returns

`Promise`\<[`FlowRun`](../interfaces/FlowRun.md)\>

---

### updateScope()

> **updateScope**(`id`, `input`): `Promise`\<[`FlowScope`](../interfaces/FlowScope.md)\>

Defined in: [flow-api.service.ts:78](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L78)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowScope`](../interfaces/FlowScope.md)\>

#### Returns

`Promise`\<[`FlowScope`](../interfaces/FlowScope.md)\>

---

### updateTransitionEffect()

> **updateTransitionEffect**(`id`, `input`): `Promise`\<[`FlowTransitionEffect`](../interfaces/FlowTransitionEffect.md)\>

Defined in: [flow-api.service.ts:198](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L198)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowTransitionEffect`](../interfaces/FlowTransitionEffect.md)\>

#### Returns

`Promise`\<[`FlowTransitionEffect`](../interfaces/FlowTransitionEffect.md)\>

---

### updateWaiver()

> **updateWaiver**(`id`, `input`): `Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

Defined in: [flow-api.service.ts:424](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L424)

#### Parameters

##### id

`string`

##### input

`Partial`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

#### Returns

`Promise`\<[`FlowWaiver`](../interfaces/FlowWaiver.md)\>

---

### upsertAnswer()

> **upsertAnswer**(`fillId`, `input`): `Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)\>

Defined in: [flow-api.service.ts:388](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L388)

#### Parameters

##### fillId

`string`

##### input

`Partial`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)\>

#### Returns

`Promise`\<[`FlowAnswer`](../interfaces/FlowAnswer.md)\>

---

### usersByRole()

> **usersByRole**(`role`, `search?`): `Promise`\<[`FlowTaskUser`](../interfaces/FlowTaskUser.md)[]\>

Defined in: [flow-api.service.ts:268](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L268)

#### Parameters

##### role

`string`

##### search?

`string`

#### Returns

`Promise`\<[`FlowTaskUser`](../interfaces/FlowTaskUser.md)[]\>

---

### withdrawTask()

> **withdrawTask**(`taskId`, `note?`): `Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>

Defined in: [flow-api.service.ts:292](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-api.service.ts#L292)

#### Parameters

##### taskId

`string`

##### note?

`string`

#### Returns

`Promise`\<[`FlowTask`](../interfaces/FlowTask.md)\>
