[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / AuthProvider

# Interface: AuthProvider

Defined in: [packages-web/sdk/src/auth-provider.ts:3](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/auth-provider.ts#L3)

## Methods

### getAccessToken()

> **getAccessToken**(): [`Awaitable`](../type-aliases/Awaitable.md)\<`string` \| `null`\>

Defined in: [packages-web/sdk/src/auth-provider.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/auth-provider.ts#L4)

#### Returns

[`Awaitable`](../type-aliases/Awaitable.md)\<`string` \| `null`\>

---

### loginRedirect()?

> `optional` **loginRedirect**(): [`Awaitable`](../type-aliases/Awaitable.md)\<`void`\>

Defined in: [packages-web/sdk/src/auth-provider.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/auth-provider.ts#L6)

#### Returns

[`Awaitable`](../type-aliases/Awaitable.md)\<`void`\>

---

### onAuthFailure()?

> `optional` **onAuthFailure**(`error`): [`Awaitable`](../type-aliases/Awaitable.md)\<`void`\>

Defined in: [packages-web/sdk/src/auth-provider.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/auth-provider.ts#L7)

#### Parameters

##### error

`unknown`

#### Returns

[`Awaitable`](../type-aliases/Awaitable.md)\<`void`\>

---

### refresh()

> **refresh**(): [`Awaitable`](../type-aliases/Awaitable.md)\<`string` \| `null`\>

Defined in: [packages-web/sdk/src/auth-provider.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/auth-provider.ts#L5)

#### Returns

[`Awaitable`](../type-aliases/Awaitable.md)\<`string` \| `null`\>
