[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / FlowEffectsService

# Class: FlowEffectsService

Defined in: [packages-web/sdk/src/generated/services/FlowEffectsService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowEffectsService.ts#L10)

## Constructors

### Constructor

> **new FlowEffectsService**(`httpRequest`): `FlowEffectsService`

Defined in: [packages-web/sdk/src/generated/services/FlowEffectsService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowEffectsService.ts#L11)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowEffectsService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowEffectsService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowEffectsService.ts#L11)

## Methods

### flowEffectsPostFlowEffectsDispatchDispatch()

> **flowEffectsPostFlowEffectsDispatchDispatch**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowEffectsService.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowEffectsService.ts#L17)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`DispatchFlowEffectsDto`](../type-aliases/DispatchFlowEffectsDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError
