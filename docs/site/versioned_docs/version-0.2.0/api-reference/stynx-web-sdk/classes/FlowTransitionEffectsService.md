[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / FlowTransitionEffectsService

# Class: FlowTransitionEffectsService

Defined in: [packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts#L10)

## Constructors

### Constructor

> **new FlowTransitionEffectsService**(`httpRequest`): `FlowTransitionEffectsService`

Defined in: [packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts#L11)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowTransitionEffectsService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts#L11)

## Methods

### flowTransitionEffectsDeleteFlowTransitionEffectsByIdDelete()

> **flowTransitionEffectsDeleteFlowTransitionEffectsByIdDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts#L17)

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

### flowTransitionEffectsGetFlowTransitionEffectsByIdGet()

> **flowTransitionEffectsGetFlowTransitionEffectsByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts#L41)

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

### flowTransitionEffectsPatchFlowTransitionEffectsByIdUpdate()

> **flowTransitionEffectsPatchFlowTransitionEffectsByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowTransitionEffectsService.ts#L65)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateFlowTransitionEffectDto`](../type-aliases/UpdateFlowTransitionEffectDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError
