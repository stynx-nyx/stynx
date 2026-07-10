[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / FlowNodeFormRulesService

# Class: FlowNodeFormRulesService

Defined in: [packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts#L10)

## Constructors

### Constructor

> **new FlowNodeFormRulesService**(`httpRequest`): `FlowNodeFormRulesService`

Defined in: [packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts#L11)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowNodeFormRulesService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts#L11)

## Methods

### flowNodeFormRulesDeleteFlowNodeFormRulesByIdDelete()

> **flowNodeFormRulesDeleteFlowNodeFormRulesByIdDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts#L17)

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

### flowNodeFormRulesGetFlowNodeFormRulesByIdGet()

> **flowNodeFormRulesGetFlowNodeFormRulesByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts#L41)

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

### flowNodeFormRulesPatchFlowNodeFormRulesByIdUpdate()

> **flowNodeFormRulesPatchFlowNodeFormRulesByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowNodeFormRulesService.ts#L65)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateFlowNodeFormRuleDto`](../type-aliases/UpdateFlowNodeFormRuleDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError
