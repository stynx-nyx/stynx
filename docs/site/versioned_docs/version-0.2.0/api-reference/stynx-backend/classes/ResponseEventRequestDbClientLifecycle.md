[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / ResponseEventRequestDbClientLifecycle

# Class: ResponseEventRequestDbClientLifecycle

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:71](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L71)

Wraps another lifecycle and defers release to HTTP response `finish/close`
events when a response object is available. This matches stacks that depend
on middleware-style response completion semantics.

## Implements

- [`RequestDbClientLifecycle`](../interfaces/RequestDbClientLifecycle.md)

## Constructors

### Constructor

> **new ResponseEventRequestDbClientLifecycle**(`delegate`, `options?`): `ResponseEventRequestDbClientLifecycle`

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:75](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L75)

#### Parameters

##### delegate

[`RequestDbClientLifecycle`](../interfaces/RequestDbClientLifecycle.md)

##### options?

[`ResponseEventRequestDbClientLifecycleOptions`](../interfaces/ResponseEventRequestDbClientLifecycleOptions.md) = `{}`

#### Returns

`ResponseEventRequestDbClientLifecycle`

## Methods

### acquire()

> **acquire**(`context`): `Promise`\<`unknown`\>

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L83)

#### Parameters

##### context

[`RequestDbClientAcquireContext`](../interfaces/RequestDbClientAcquireContext.md)

#### Returns

`Promise`\<`unknown`\>

#### Implementation of

[`RequestDbClientLifecycle`](../interfaces/RequestDbClientLifecycle.md).[`acquire`](../interfaces/RequestDbClientLifecycle.md#acquire)

---

### release()

> **release**(`context`): `Promise`\<`void`\>

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L87)

#### Parameters

##### context

[`RequestDbClientReleaseContext`](../interfaces/RequestDbClientReleaseContext.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`RequestDbClientLifecycle`](../interfaces/RequestDbClientLifecycle.md).[`release`](../interfaces/RequestDbClientLifecycle.md#release)
