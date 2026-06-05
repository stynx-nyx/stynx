[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / CancelablePromise

# Class: CancelablePromise\<T\>

Defined in: [packages-web/sdk/src/generated/core/CancelablePromise.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/CancelablePromise.ts#L25)

## Type Parameters

### T

`T`

## Implements

- `Promise`\<`T`\>

## Constructors

### Constructor

> **new CancelablePromise**\<`T`\>(`executor`): `CancelablePromise`\<`T`\>

Defined in: [packages-web/sdk/src/generated/core/CancelablePromise.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/CancelablePromise.ts#L34)

#### Parameters

##### executor

(`resolve`, `reject`, `onCancel`) => `void`

#### Returns

`CancelablePromise`\<`T`\>

## Accessors

### \[toStringTag\]

#### Get Signature

> **get** **\[toStringTag\]**(): `string`

Defined in: [packages-web/sdk/src/generated/core/CancelablePromise.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/CancelablePromise.ts#L88)

##### Returns

`string`

#### Implementation of

`Promise.[toStringTag]`

---

### isCancelled

#### Get Signature

> **get** **isCancelled**(): `boolean`

Defined in: [packages-web/sdk/src/generated/core/CancelablePromise.ts:128](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/CancelablePromise.ts#L128)

##### Returns

`boolean`

## Methods

### cancel()

> **cancel**(): `void`

Defined in: [packages-web/sdk/src/generated/core/CancelablePromise.ts:109](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/CancelablePromise.ts#L109)

#### Returns

`void`

---

### catch()

> **catch**\<`TResult`\>(`onRejected?`): `Promise`\<`T` \| `TResult`\>

Defined in: [packages-web/sdk/src/generated/core/CancelablePromise.ts:99](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/CancelablePromise.ts#L99)

Attaches a callback for only the rejection of the Promise.

#### Type Parameters

##### TResult

`TResult` = `never`

#### Parameters

##### onRejected?

((`reason`) => `TResult` \| `PromiseLike`\<`TResult`\>) \| `null`

#### Returns

`Promise`\<`T` \| `TResult`\>

A Promise for the completion of the callback.

#### Implementation of

`Promise.catch`

---

### finally()

> **finally**(`onFinally?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/generated/core/CancelablePromise.ts:105](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/CancelablePromise.ts#L105)

Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
resolved value cannot be modified from the callback.

#### Parameters

##### onFinally?

(() => `void`) \| `null`

#### Returns

`Promise`\<`T`\>

A Promise for the completion of the callback.

#### Implementation of

`Promise.finally`

---

### then()

> **then**\<`TResult1`, `TResult2`\>(`onFulfilled?`, `onRejected?`): `Promise`\<`TResult1` \| `TResult2`\>

Defined in: [packages-web/sdk/src/generated/core/CancelablePromise.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/CancelablePromise.ts#L92)

Attaches callbacks for the resolution and/or rejection of the Promise.

#### Type Parameters

##### TResult1

`TResult1` = `T`

##### TResult2

`TResult2` = `never`

#### Parameters

##### onFulfilled?

((`value`) => `TResult1` \| `PromiseLike`\<`TResult1`\>) \| `null`

##### onRejected?

((`reason`) => `TResult2` \| `PromiseLike`\<`TResult2`\>) \| `null`

#### Returns

`Promise`\<`TResult1` \| `TResult2`\>

A Promise for the completion of which ever callback is executed.

#### Implementation of

`Promise.then`
