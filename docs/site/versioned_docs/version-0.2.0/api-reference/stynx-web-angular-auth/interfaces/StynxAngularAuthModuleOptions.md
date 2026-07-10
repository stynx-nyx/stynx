[**@stynx-nyx/angular-auth**](../index.md)

---

[@stynx-nyx/angular-auth](../index.md) / StynxAngularAuthModuleOptions

# Interface: StynxAngularAuthModuleOptions

Defined in: [types.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L31)

## Properties

### hostedActions?

> `optional` **hostedActions?**: [`StynxHostedAuthActionOptions`](StynxHostedAuthActionOptions.md)

Defined in: [types.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L35)

---

### loginRedirectRoute?

> `optional` **loginRedirectRoute?**: `string`

Defined in: [types.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L33)

---

### oidc

> **oidc**: `OpenIdConfiguration`

Defined in: [types.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L32)

---

### permissionDeniedPath?

> `optional` **permissionDeniedPath?**: `string`

Defined in: [types.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L34)

---

### refreshTokenCookie?

> `optional` **refreshTokenCookie?**: `object`

Defined in: [types.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L42)

#### name?

> `optional` **name?**: `string`

#### path?

> `optional` **path?**: `string`

#### sameSite?

> `optional` **sameSite?**: `"Strict"` \| `"Lax"` \| `"None"`

#### secure?

> `optional` **secure?**: `boolean`

---

### refreshTokenStorage?

> `optional` **refreshTokenStorage?**: [`StynxRefreshTokenStorageMode`](../type-aliases/StynxRefreshTokenStorageMode.md)

Defined in: [types.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L41)

---

### sessionStorageKey?

> `optional` **sessionStorageKey?**: `string`

Defined in: [types.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L40)

---

### ~~unauthorizedRoute?~~

> `optional` **unauthorizedRoute?**: `string`

Defined in: [types.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L39)

#### Deprecated

since: 1.x — use permissionDeniedPath.
