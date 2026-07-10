[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / InMemoryTokenStore

# Class: InMemoryTokenStore

Defined in: [packages-web/sdk/src/token-store.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/token-store.ts#L17)

## Implements

- [`FrontendTokenStore`](../interfaces/FrontendTokenStore.md)

## Constructors

### Constructor

> **new InMemoryTokenStore**(): `InMemoryTokenStore`

#### Returns

`InMemoryTokenStore`

## Methods

### clear()

> **clear**(): `void`

Defined in: [packages-web/sdk/src/token-store.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/token-store.ts#L28)

#### Returns

`void`

#### Implementation of

[`FrontendTokenStore`](../interfaces/FrontendTokenStore.md).[`clear`](../interfaces/FrontendTokenStore.md#clear)

---

### read()

> **read**(): [`FrontendTokens`](../interfaces/FrontendTokens.md) \| `null`

Defined in: [packages-web/sdk/src/token-store.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/token-store.ts#L20)

#### Returns

[`FrontendTokens`](../interfaces/FrontendTokens.md) \| `null`

#### Implementation of

[`FrontendTokenStore`](../interfaces/FrontendTokenStore.md).[`read`](../interfaces/FrontendTokenStore.md#read)

---

### write()

> **write**(`tokens`): `void`

Defined in: [packages-web/sdk/src/token-store.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/token-store.ts#L24)

#### Parameters

##### tokens

[`FrontendTokens`](../interfaces/FrontendTokens.md)

#### Returns

`void`

#### Implementation of

[`FrontendTokenStore`](../interfaces/FrontendTokenStore.md).[`write`](../interfaces/FrontendTokenStore.md#write)
