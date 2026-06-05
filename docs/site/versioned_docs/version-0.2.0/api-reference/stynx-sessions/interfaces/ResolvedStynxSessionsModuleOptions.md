[**@stynx/sessions**](../index.md)

---

[@stynx/sessions](../index.md) / ResolvedStynxSessionsModuleOptions

# Interface: ResolvedStynxSessionsModuleOptions

Defined in: [packages/sessions/src/types.ts:140](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L140)

## Properties

### audience?

> `optional` **audience?**: `string`

Defined in: [packages/sessions/src/types.ts:142](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L142)

---

### clock

> **clock**: () => `Date`

Defined in: [packages/sessions/src/types.ts:159](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L159)

#### Returns

`Date`

---

### issuer

> **issuer**: `string`

Defined in: [packages/sessions/src/types.ts:141](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L141)

---

### jwt

> **jwt**: `object`

Defined in: [packages/sessions/src/types.ts:148](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L148)

#### cacheTtlMs

> **cacheTtlMs**: `number`

#### keySet?

> `optional` **keySet?**: [`StynxSessionSigningKeySet`](StynxSessionSigningKeySet.md)

#### secretId?

> `optional` **secretId?**: `string`

---

### redis

> **redis**: `object`

Defined in: [packages/sessions/src/types.ts:143](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L143)

#### invalidateChannel

> **invalidateChannel**: `string`

#### keyPrefix

> **keyPrefix**: `string`

#### url

> **url**: `string`

---

### timeouts

> **timeouts**: `object`

Defined in: [packages/sessions/src/types.ts:153](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L153)

#### absoluteSeconds

> **absoluteSeconds**: `number`

#### accessNotBeforeDelaySeconds

> **accessNotBeforeDelaySeconds**: `number`

#### accessSeconds

> **accessSeconds**: `number`

#### idleSeconds

> **idleSeconds**: `number`
