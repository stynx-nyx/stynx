[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / FlowRunsService

# Class: FlowRunsService

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L11)

## Constructors

### Constructor

> **new FlowRunsService**(`httpRequest`): `FlowRunsService`

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L12)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`FlowRunsService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L12)

## Methods

### flowRunsGetFlowRunsByIdActivityActivity()

> **flowRunsGetFlowRunsByIdActivityActivity**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L87)

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

### flowRunsGetFlowRunsByIdEventsListEvents()

> **flowRunsGetFlowRunsByIdEventsListEvents**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:111](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L111)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>[]\>

JsonValue OK

#### Throws

ApiError

---

### flowRunsGetFlowRunsByIdFactsFacts()

> **flowRunsGetFlowRunsByIdFactsFacts**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:135](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L135)

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

### flowRunsGetFlowRunsByIdGet()

> **flowRunsGetFlowRunsByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L35)

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

### flowRunsGetFlowRunsByIdNodesListNodeRuns()

> **flowRunsGetFlowRunsByIdNodesListNodeRuns**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:159](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L159)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>[]\>

JsonValue OK

#### Throws

ApiError

---

### flowRunsGetFlowRunsByIdTasksListTasks()

> **flowRunsGetFlowRunsByIdTasksListTasks**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>[]\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:183](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L183)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>[]\>

JsonValue OK

#### Throws

ApiError

---

### flowRunsGetFlowRunsList()

> **flowRunsGetFlowRunsList**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L18)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError

---

### flowRunsGetFlowRunsSummarySummary()

> **flowRunsGetFlowRunsSummarySummary**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:230](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L230)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError

---

### flowRunsPatchFlowRunsByIdUpdate()

> **flowRunsPatchFlowRunsByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:59](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L59)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateFlowRunDto`](../type-aliases/UpdateFlowRunDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError

---

### flowRunsPostFlowRunsEnsureEnsure()

> **flowRunsPostFlowRunsEnsureEnsure**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

Defined in: [packages-web/sdk/src/generated/services/FlowRunsService.ts:207](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/FlowRunsService.ts#L207)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`EnsureFlowRunDto`](../type-aliases/EnsureFlowRunDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| `Record`\<`string`, [`JsonValue`](../type-aliases/JsonValue.md)\>\>

JsonValue OK

#### Throws

ApiError
