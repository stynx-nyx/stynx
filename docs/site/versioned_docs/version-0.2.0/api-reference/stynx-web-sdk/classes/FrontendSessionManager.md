[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / FrontendSessionManager

# Class: FrontendSessionManager

Defined in: [packages-web/sdk/src/session-manager.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/session-manager.ts#L24)

## Constructors

### Constructor

> **new FrontendSessionManager**(`tokenStore`, `options?`): `FrontendSessionManager`

Defined in: [packages-web/sdk/src/session-manager.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/session-manager.ts#L29)

#### Parameters

##### tokenStore

[`FrontendTokenStore`](../interfaces/FrontendTokenStore.md)

##### options?

[`FrontendSessionManagerOptions`](../interfaces/FrontendSessionManagerOptions.md) = `{}`

#### Returns

`FrontendSessionManager`

## Methods

### clear()

> **clear**(): `void`

Defined in: [packages-web/sdk/src/session-manager.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/session-manager.ts#L63)

#### Returns

`void`

---

### getTenantId()

> **getTenantId**(): `string` \| `null`

Defined in: [packages-web/sdk/src/session-manager.ts:76](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/session-manager.ts#L76)

#### Returns

`string` \| `null`

---

### getValidAccessToken()

> **getValidAccessToken**(): `string` \| `null`

Defined in: [packages-web/sdk/src/session-manager.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/session-manager.ts#L67)

#### Returns

`string` \| `null`

---

### hydrate()

> **hydrate**(): [`FrontendAuthState`](../interfaces/FrontendAuthState.md)

Defined in: [packages-web/sdk/src/session-manager.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/session-manager.ts#L38)

#### Returns

[`FrontendAuthState`](../interfaces/FrontendAuthState.md)

---

### setTokens()

> **setTokens**(`tokens`): [`FrontendAuthState`](../interfaces/FrontendAuthState.md)

Defined in: [packages-web/sdk/src/session-manager.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/session-manager.ts#L50)

#### Parameters

##### tokens

[`FrontendTokens`](../interfaces/FrontendTokens.md)

#### Returns

[`FrontendAuthState`](../interfaces/FrontendAuthState.md)
