[**@stynx-nyx/sessions**](../index.md)

---

[@stynx-nyx/sessions](../index.md) / StynxSessionsModuleOptions

# Interface: StynxSessionsModuleOptions

Defined in: [packages/sessions/src/types.ts:118](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L118)

## Properties

### audience?

> `optional` **audience?**: `string`

Defined in: [packages/sessions/src/types.ts:120](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L120)

---

### clock?

> `optional` **clock?**: () => `Date`

Defined in: [packages/sessions/src/types.ts:137](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L137)

#### Returns

`Date`

---

### issuer

> **issuer**: `string`

Defined in: [packages/sessions/src/types.ts:119](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L119)

---

### jwt

> **jwt**: `object`

Defined in: [packages/sessions/src/types.ts:126](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L126)

#### cacheTtlMs?

> `optional` **cacheTtlMs?**: `number`

#### keySet?

> `optional` **keySet?**: [`StynxSessionSigningKeySet`](StynxSessionSigningKeySet.md)

#### secretId?

> `optional` **secretId?**: `string`

---

### redis

> **redis**: `object`

Defined in: [packages/sessions/src/types.ts:121](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L121)

#### invalidateChannel?

> `optional` **invalidateChannel?**: `string`

#### keyPrefix?

> `optional` **keyPrefix?**: `string`

#### url

> **url**: `string`

---

### timeouts?

> `optional` **timeouts?**: `object`

Defined in: [packages/sessions/src/types.ts:131](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L131)

#### absoluteSeconds?

> `optional` **absoluteSeconds?**: `number`

#### accessNotBeforeDelaySeconds?

> `optional` **accessNotBeforeDelaySeconds?**: `number`

#### accessSeconds?

> `optional` **accessSeconds?**: `number`

#### idleSeconds?

> `optional` **idleSeconds?**: `number`
