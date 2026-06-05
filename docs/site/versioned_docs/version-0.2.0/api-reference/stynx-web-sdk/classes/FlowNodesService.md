[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / FlowNodesService

# Class: FlowNodesService

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L12)

## Constructors

### Constructor

> **new FlowNodesService**(`httpRequest`): `FlowNodesService`

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L13)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowNodesService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L13)

## Methods

### flowNodesDeleteFlowNodesByIdDelete()

> **flowNodesDeleteFlowNodesByIdDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L19)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowNodesGetFlowNodesByIdGet()

> **flowNodesGetFlowNodesByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L43)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowNodesGetFlowNodesByNodeIdAgentRulesListAgentRules()

> **flowNodesGetFlowNodesByNodeIdAgentRulesListAgentRules**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:95](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L95)

#### Parameters

##### \_\_namedParameters

###### nodeId

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowNodesGetFlowNodesByNodeIdFormRulesListFormRules()

> **flowNodesGetFlowNodesByNodeIdFormRulesListFormRules**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:147](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L147)

#### Parameters

##### \_\_namedParameters

###### nodeId

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowNodesPatchFlowNodesByIdUpdate()

> **flowNodesPatchFlowNodesByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L67)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateFlowNodeDto`](../type-aliases/UpdateFlowNodeDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowNodesPostFlowNodesByNodeIdAgentRulesCreateAgentRule()

> **flowNodesPostFlowNodesByNodeIdAgentRulesCreateAgentRule**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:119](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L119)

#### Parameters

##### \_\_namedParameters

###### nodeId

`string`

###### requestBody

[`CreateFlowAgentRuleDto`](../type-aliases/CreateFlowAgentRuleDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowNodesPostFlowNodesByNodeIdFormRulesCreateFormRule()

> **flowNodesPostFlowNodesByNodeIdFormRulesCreateFormRule**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodesService.ts:171](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodesService.ts#L171)

#### Parameters

##### \_\_namedParameters

###### nodeId

`string`

###### requestBody

[`CreateFlowNodeFormRuleDto`](../type-aliases/CreateFlowNodeFormRuleDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError
