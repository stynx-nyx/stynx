[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / ResolvedStynxAuthModuleOptions

# Interface: ResolvedStynxAuthModuleOptions

Defined in: [types.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L25)

## Properties

### cognito?

> `optional` **cognito?**: `object`

Defined in: [types.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L26)

#### audience?

> `optional` **audience?**: `string`

#### issuer

> **issuer**: `string`

#### jwksUri?

> `optional` **jwksUri?**: `string`

---

### permissions

> **permissions**: `object`

Defined in: [types.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L41)

#### dbFallbackOnRedisDown

> **dbFallbackOnRedisDown**: `boolean`

#### driftResyncIntervalMs?

> `optional` **driftResyncIntervalMs?**: `number`

---

### redis?

> `optional` **redis?**: `object`

Defined in: [types.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L36)

#### invalidateChannel

> **invalidateChannel**: `string`

#### keyPrefix

> **keyPrefix**: `string`

#### url

> **url**: `string`

---

### stynx

> **stynx**: `object`

Defined in: [types.ts:31](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L31)

#### audience?

> `optional` **audience?**: `string`

#### issuer

> **issuer**: `string`

#### jwksUri?

> `optional` **jwksUri?**: `string`
