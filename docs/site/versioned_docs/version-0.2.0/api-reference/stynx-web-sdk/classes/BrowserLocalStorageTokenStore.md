[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / BrowserLocalStorageTokenStore

# Class: BrowserLocalStorageTokenStore

Defined in: [packages-web/sdk/src/token-store.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/token-store.ts#L33)

## Implements

- [`FrontendTokenStore`](../interfaces/FrontendTokenStore.md)

## Constructors

### Constructor

> **new BrowserLocalStorageTokenStore**(`storageKey?`, `storageProvider?`): `BrowserLocalStorageTokenStore`

Defined in: [packages-web/sdk/src/token-store.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/token-store.ts#L34)

#### Parameters

##### storageKey?

`string` = `'stynx.auth.tokens'`

##### storageProvider?

`BrowserStorageLike` \| `null`

#### Returns

`BrowserLocalStorageTokenStore`

## Methods

### clear()

> **clear**(): `void`

Defined in: [packages-web/sdk/src/token-store.ts:59](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/token-store.ts#L59)

#### Returns

`void`

#### Implementation of

[`FrontendTokenStore`](../interfaces/FrontendTokenStore.md).[`clear`](../interfaces/FrontendTokenStore.md#clear)

---

### read()

> **read**(): [`FrontendTokens`](../interfaces/FrontendTokens.md) \| `null`

Defined in: [packages-web/sdk/src/token-store.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/token-store.ts#L41)

#### Returns

[`FrontendTokens`](../interfaces/FrontendTokens.md) \| `null`

#### Implementation of

[`FrontendTokenStore`](../interfaces/FrontendTokenStore.md).[`read`](../interfaces/FrontendTokenStore.md#read)

---

### write()

> **write**(`tokens`): `void`

Defined in: [packages-web/sdk/src/token-store.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/token-store.ts#L52)

#### Parameters

##### tokens

[`FrontendTokens`](../interfaces/FrontendTokens.md)

#### Returns

`void`

#### Implementation of

[`FrontendTokenStore`](../interfaces/FrontendTokenStore.md).[`write`](../interfaces/FrontendTokenStore.md#write)
