[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / FlowScopesService

# Class: FlowScopesService

Defined in: [packages-web/sdk/src/generated/services/FlowScopesService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowScopesService.ts#L11)

## Constructors

### Constructor

> **new FlowScopesService**(`httpRequest`): `FlowScopesService`

Defined in: [packages-web/sdk/src/generated/services/FlowScopesService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowScopesService.ts#L12)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowScopesService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowScopesService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowScopesService.ts#L12)

## Methods

### flowScopesDeleteFlowScopesByIdDelete()

> **flowScopesDeleteFlowScopesByIdDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowScopesService.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowScopesService.ts#L58)

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

### flowScopesGetFlowScopesByIdGet()

> **flowScopesGetFlowScopesByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowScopesService.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowScopesService.ts#L82)

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

### flowScopesGetFlowScopesList()

> **flowScopesGetFlowScopesList**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowScopesService.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowScopesService.ts#L18)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)[]\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowScopesPatchFlowScopesByIdUpdate()

> **flowScopesPatchFlowScopesByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowScopesService.ts:106](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowScopesService.ts#L106)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateFlowScopeDto`](../type-aliases/UpdateFlowScopeDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError

---

### flowScopesPostFlowScopesCreate()

> **flowScopesPostFlowScopesCreate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

Defined in: [packages-web/sdk/src/generated/services/FlowScopesService.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowScopesService.ts#L35)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`CreateFlowScopeDto`](../type-aliases/CreateFlowScopeDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`FlowJsonObject`](../type-aliases/FlowJsonObject.md)\>

FlowJsonObject OK

#### Throws

ApiError
