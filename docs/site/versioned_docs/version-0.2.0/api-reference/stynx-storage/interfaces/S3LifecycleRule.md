[**@stynx-nyx/storage**](../index.md)

---

[@stynx-nyx/storage](../index.md) / S3LifecycleRule

# Interface: S3LifecycleRule

Defined in: [packages/storage/src/types.ts:72](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/types.ts#L72)

## Properties

### expirationDays?

> `optional` **expirationDays?**: `number`

Defined in: [packages/storage/src/types.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/types.ts#L80)

Days after object creation to expire non-locked objects.

---

### name

> **name**: `string`

Defined in: [packages/storage/src/types.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/types.ts#L74)

Human-readable name. Also used as the S3 rule ID.

---

### prefix?

> `optional` **prefix?**: `string`

Defined in: [packages/storage/src/types.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/types.ts#L82)

Optional key prefix filter. If absent, applies to all objects.

---

### transitionToGlacierDays?

> `optional` **transitionToGlacierDays?**: `number`

Defined in: [packages/storage/src/types.ts:78](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/types.ts#L78)

Days after object creation to transition to S3 Glacier.

---

### transitionToIaDays?

> `optional` **transitionToIaDays?**: `number`

Defined in: [packages/storage/src/types.ts:76](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/storage/src/types.ts#L76)

Days after object creation to transition to S3 Standard-IA.
