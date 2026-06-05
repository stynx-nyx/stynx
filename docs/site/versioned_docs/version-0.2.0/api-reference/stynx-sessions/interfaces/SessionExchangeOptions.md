[**@stynx/sessions**](../index.md)

---

[@stynx/sessions](../index.md) / SessionExchangeOptions

# Interface: SessionExchangeOptions

Defined in: [packages/sessions/src/types.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L61)

## Properties

### actorUserId

> **actorUserId**: `string`

Defined in: [packages/sessions/src/types.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L67)

The user performing the exchange. Must match the originating session.

---

### deviceMeta?

> `optional` **deviceMeta?**: [`DeviceMetadata`](DeviceMetadata.md)

Defined in: [packages/sessions/src/types.ts:71](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L71)

Optional device metadata to carry over or override.

---

### membershipId?

> `optional` **membershipId?**: `string`

Defined in: [packages/sessions/src/types.ts:69](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L69)

Optional membership ID in the new tenant.

---

### newTenantId

> **newTenantId**: `string`

Defined in: [packages/sessions/src/types.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L65)

The tenant the new session should be scoped to.

---

### permsHash?

> `optional` **permsHash?**: `string`

Defined in: [packages/sessions/src/types.ts:73](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L73)

Optional permissions hash for the new tenant context.

---

### sessionId

> **sessionId**: `string`

Defined in: [packages/sessions/src/types.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/types.ts#L63)

The session being replaced. Must be active and belong to `actorUserId`.
