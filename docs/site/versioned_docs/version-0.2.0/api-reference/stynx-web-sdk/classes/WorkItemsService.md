[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / WorkItemsService

# Class: WorkItemsService

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L11)

## Constructors

### Constructor

> **new WorkItemsService**(`httpRequest`): `WorkItemsService`

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L12)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`WorkItemsService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L12)

## Methods

### workItemsDeleteWorkItemsByIdDelete()

> **workItemsDeleteWorkItemsByIdDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L58)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### workItemsDeleteWorkItemsByIdHardHardDelete()

> **workItemsDeleteWorkItemsByIdHardHardDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:134](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L134)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### workItemsGetWorkItemsByIdGet()

> **workItemsGetWorkItemsByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L82)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### workItemsGetWorkItemsList()

> **workItemsGetWorkItemsList**(): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L18)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### workItemsGetWorkItemsTrashTrash()

> **workItemsGetWorkItemsTrashTrash**(): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:182](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L182)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### workItemsPatchWorkItemsByIdUpdate()

> **workItemsPatchWorkItemsByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:106](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L106)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateWorkItemDto`](../type-aliases/UpdateWorkItemDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### workItemsPostWorkItemsByIdRestoreRestore()

> **workItemsPostWorkItemsByIdRestoreRestore**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:158](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L158)

#### Parameters

##### \_\_namedParameters

###### id

`string`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### workItemsPostWorkItemsCreate()

> **workItemsPostWorkItemsCreate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/WorkItemsService.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/WorkItemsService.ts#L35)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`CreateWorkItemDto`](../type-aliases/CreateWorkItemDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError
