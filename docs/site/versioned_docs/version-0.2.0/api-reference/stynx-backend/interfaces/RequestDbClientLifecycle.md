[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / RequestDbClientLifecycle

# Interface: RequestDbClientLifecycle

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L14)

## Methods

### acquire()

> **acquire**(`context`): `unknown`

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L15)

#### Parameters

##### context

[`RequestDbClientAcquireContext`](RequestDbClientAcquireContext.md)

#### Returns

`unknown`

---

### release()

> **release**(`context`): `void` \| `Promise`\<`void`\>

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L16)

#### Parameters

##### context

[`RequestDbClientReleaseContext`](RequestDbClientReleaseContext.md)

#### Returns

`void` \| `Promise`\<`void`\>
