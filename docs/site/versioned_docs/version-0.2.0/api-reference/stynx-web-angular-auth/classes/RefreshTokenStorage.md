[**@stynx-nyx/angular-auth**](../index.md)

---

[@stynx-nyx/angular-auth](../index.md) / RefreshTokenStorage

# Class: RefreshTokenStorage

Defined in: [storage.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/storage.ts#L21)

## Constructors

### Constructor

> **new RefreshTokenStorage**(`key`, `mode?`, `storage?`, `browserDocument?`, `cookie?`): `RefreshTokenStorage`

Defined in: [storage.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/storage.ts#L25)

#### Parameters

##### key

`string`

##### mode?

[`RefreshTokenStorageMode`](../type-aliases/RefreshTokenStorageMode.md) = `'session-storage'`

##### storage?

[`SessionStorageLike`](../interfaces/SessionStorageLike.md) \| `null`

##### browserDocument?

`Document` \| `null`

##### cookie?

[`CookieOptions`](../interfaces/CookieOptions.md) = `{}`

#### Returns

`RefreshTokenStorage`

## Methods

### clear()

> **clear**(): `void`

Defined in: [storage.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/storage.ts#L63)

#### Returns

`void`

---

### read()

> **read**(): `string` \| `null`

Defined in: [storage.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/storage.ts#L41)

#### Returns

`string` \| `null`

---

### write()

> **write**(`token`): `void`

Defined in: [storage.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/storage.ts#L48)

#### Parameters

##### token

`string` \| `null`

#### Returns

`void`
