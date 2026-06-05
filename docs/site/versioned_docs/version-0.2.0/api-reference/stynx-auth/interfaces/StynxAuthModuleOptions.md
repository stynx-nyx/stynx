[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / StynxAuthModuleOptions

# Interface: StynxAuthModuleOptions

Defined in: [types.ts:3](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L3)

## Properties

### cognito?

> `optional` **cognito?**: `object`

Defined in: [types.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L4)

#### audience?

> `optional` **audience?**: `string`

#### issuer

> **issuer**: `string`

#### jwksUri?

> `optional` **jwksUri?**: `string`

---

### permissions?

> `optional` **permissions?**: `object`

Defined in: [types.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L19)

#### dbFallbackOnRedisDown?

> `optional` **dbFallbackOnRedisDown?**: `boolean`

#### driftResyncIntervalMs?

> `optional` **driftResyncIntervalMs?**: `number`

---

### redis?

> `optional` **redis?**: `object`

Defined in: [types.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L14)

#### invalidateChannel?

> `optional` **invalidateChannel?**: `string`

#### keyPrefix?

> `optional` **keyPrefix?**: `string`

#### url

> **url**: `string`

---

### stynx?

> `optional` **stynx?**: `object`

Defined in: [types.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/types.ts#L9)

#### audience?

> `optional` **audience?**: `string`

#### issuer

> **issuer**: `string`

#### jwksUri?

> `optional` **jwksUri?**: `string`
