[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / FlowSignalService

# Class: FlowSignalService

Defined in: [packages-web/sdk/src/generated/services/FlowSignalService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowSignalService.ts#L10)

## Constructors

### Constructor

> **new FlowSignalService**(`httpRequest`): `FlowSignalService`

Defined in: [packages-web/sdk/src/generated/services/FlowSignalService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowSignalService.ts#L11)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowSignalService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowSignalService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowSignalService.ts#L11)

## Methods

### flowSignalPostFlowSignalSignal()

> **flowSignalPostFlowSignalSignal**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowSignalService.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowSignalService.ts#L17)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`FlowSignalDto`](../type-aliases/FlowSignalDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError
