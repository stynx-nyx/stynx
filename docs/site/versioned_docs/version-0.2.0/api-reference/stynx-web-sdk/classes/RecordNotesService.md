[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / RecordNotesService

# Class: RecordNotesService

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L11)

## Constructors

### Constructor

> **new RecordNotesService**(`httpRequest`): `RecordNotesService`

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L12)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`RecordNotesService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L12)

## Methods

### recordNotesDeleteRecordNotesByIdDelete()

> **recordNotesDeleteRecordNotesByIdDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L58)

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

### recordNotesDeleteRecordNotesByIdHardHardDelete()

> **recordNotesDeleteRecordNotesByIdHardHardDelete**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:134](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L134)

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

### recordNotesGetRecordNotesByIdGet()

> **recordNotesGetRecordNotesByIdGet**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L82)

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

### recordNotesGetRecordNotesList()

> **recordNotesGetRecordNotesList**(): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L18)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### recordNotesPatchRecordNotesByIdUpdate()

> **recordNotesPatchRecordNotesByIdUpdate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:106](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L106)

#### Parameters

##### \_\_namedParameters

###### id

`string`

###### requestBody

[`UpdateRecordNoteDto`](../type-aliases/UpdateRecordNoteDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### recordNotesPostRecordNotesByIdRestoreRestore()

> **recordNotesPostRecordNotesByIdRestoreRestore**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:158](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L158)

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

### recordNotesPostRecordNotesCreate()

> **recordNotesPostRecordNotesCreate**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/RecordNotesService.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/RecordNotesService.ts#L35)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`CreateRecordNoteDto`](../type-aliases/CreateRecordNoteDto.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError
