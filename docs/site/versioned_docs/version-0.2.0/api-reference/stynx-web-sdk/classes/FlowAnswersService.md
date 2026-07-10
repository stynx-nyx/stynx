[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / FlowAnswersService

# Class: FlowAnswersService

Defined in: [packages-web/sdk/src/generated/services/FlowAnswersService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowAnswersService.ts#L10)

## Constructors

### Constructor

> **new FlowAnswersService**(`httpRequest`): `FlowAnswersService`

Defined in: [packages-web/sdk/src/generated/services/FlowAnswersService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowAnswersService.ts#L11)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowAnswersService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowAnswersService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowAnswersService.ts#L11)

## Methods

### flowAnswersDeleteFlowAnswersByIdDelete()

> **flowAnswersDeleteFlowAnswersByIdDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowAnswersService.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowAnswersService.ts#L17)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError

---

### flowAnswersPatchFlowAnswersByIdUpdate()

> **flowAnswersPatchFlowAnswersByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowAnswersService.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowAnswersService.ts#L41)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateFlowAnswerDto`](../type-aliases/UpdateFlowAnswerDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError
