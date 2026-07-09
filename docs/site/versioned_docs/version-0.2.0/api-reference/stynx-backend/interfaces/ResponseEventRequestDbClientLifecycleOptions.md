[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / ResponseEventRequestDbClientLifecycleOptions

# Interface: ResponseEventRequestDbClientLifecycleOptions

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:59](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L59)

## Properties

### releaseEvents?

> `optional` **releaseEvents?**: readonly (`"finish"` \| `"close"`)[]

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L61)

---

### responseResolver?

> `optional` **responseResolver?**: (`request`) => [`ResponseLike`](ResponseLike.md) \| `undefined`

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L60)

#### Parameters

##### request

[`RequestLike`](RequestLike.md)

#### Returns

[`ResponseLike`](ResponseLike.md) \| `undefined`
