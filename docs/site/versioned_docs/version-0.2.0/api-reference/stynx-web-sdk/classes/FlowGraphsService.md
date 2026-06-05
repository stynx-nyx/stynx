[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / FlowGraphsService

# Class: FlowGraphsService

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L17)

## Constructors

### Constructor

> **new FlowGraphsService**(`httpRequest`): `FlowGraphsService`

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L18)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowGraphsService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L18)

## Methods

### flowGraphsDeleteFlowGraphsByIdDelete()

> **flowGraphsDeleteFlowGraphsByIdDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:227](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L227)

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

### flowGraphsGetFlowGraphsByGraphIdEdgesListEdges()

> **flowGraphsGetFlowGraphsByGraphIdEdgesListEdges**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:71](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L71)

#### Parameters

##### \_\_namedParameters

###### graphId

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsGetFlowGraphsByGraphIdNodesListNodes()

> **flowGraphsGetFlowGraphsByGraphIdNodesListNodes**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:123](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L123)

#### Parameters

##### \_\_namedParameters

###### graphId

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsGetFlowGraphsByGraphIdTransitionEffectsListTransitionEffects()

> **flowGraphsGetFlowGraphsByGraphIdTransitionEffectsListTransitionEffects**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:175](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L175)

#### Parameters

##### \_\_namedParameters

###### graphId

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsGetFlowGraphsByIdExportExport()

> **flowGraphsGetFlowGraphsByIdExportExport**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowGraphExportDocument`](../type-aliases/FlowGraphExportDocument.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:303](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L303)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowGraphExportDocument`](../type-aliases/FlowGraphExportDocument.md)\>

FlowGraphExportDocument OK

#### Throws

ApiError

---

### flowGraphsGetFlowGraphsByIdGet()

> **flowGraphsGetFlowGraphsByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:251](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L251)

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

### flowGraphsGetFlowGraphsList()

> **flowGraphsGetFlowGraphsList**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L24)

#### Parameters

##### \_\_namedParameters

###### scopeId?

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsPatchFlowGraphsByIdUpdate()

> **flowGraphsPatchFlowGraphsByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:275](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L275)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateFlowGraphDto`](../type-aliases/UpdateFlowGraphDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsPostFlowGraphsByGraphIdEdgesCreateEdge()

> **flowGraphsPostFlowGraphsByGraphIdEdgesCreateEdge**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:95](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L95)

#### Parameters

##### \_\_namedParameters

###### graphId

`string`

###### requestBody

[`CreateFlowEdgeDto`](../type-aliases/CreateFlowEdgeDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsPostFlowGraphsByGraphIdNodesCreateNode()

> **flowGraphsPostFlowGraphsByGraphIdNodesCreateNode**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:147](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L147)

#### Parameters

##### \_\_namedParameters

###### graphId

`string`

###### requestBody

[`CreateFlowNodeDto`](../type-aliases/CreateFlowNodeDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsPostFlowGraphsByGraphIdTransitionEffectsCreateTransitionEffect()

> **flowGraphsPostFlowGraphsByGraphIdTransitionEffectsCreateTransitionEffect**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:199](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L199)

#### Parameters

##### \_\_namedParameters

###### graphId

`string`

###### requestBody

[`CreateFlowTransitionEffectDto`](../type-aliases/CreateFlowTransitionEffectDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsPostFlowGraphsByIdPublishPublish()

> **flowGraphsPostFlowGraphsByIdPublishPublish**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:327](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L327)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`PublishFlowGraphDto`](../type-aliases/PublishFlowGraphDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsPostFlowGraphsCreate()

> **flowGraphsPostFlowGraphsCreate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L48)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`CreateFlowGraphDto`](../type-aliases/CreateFlowGraphDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowGraphsPostFlowGraphsImportImport()

> **flowGraphsPostFlowGraphsImportImport**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowGraphExportDocument`](../type-aliases/FlowGraphExportDocument.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowGraphsService.ts:355](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowGraphsService.ts#L355)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`FlowGraphImportDocument`](../type-aliases/FlowGraphImportDocument.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowGraphExportDocument`](../type-aliases/FlowGraphExportDocument.md)\>

FlowGraphExportDocument OK

#### Throws

ApiError
