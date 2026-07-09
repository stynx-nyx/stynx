[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / ResponseLike

# Interface: ResponseLike

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L19)

## Properties

### finished?

> `optional` **finished?**: `boolean`

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L21)

---

### writableEnded?

> `optional` **writableEnded?**: `boolean`

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L22)

## Methods

### once()

> **once**(`event`, `listener`): `unknown`

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L20)

#### Parameters

##### event

`"finish"` \| `"close"`

##### listener

() => `void`

#### Returns

`unknown`
