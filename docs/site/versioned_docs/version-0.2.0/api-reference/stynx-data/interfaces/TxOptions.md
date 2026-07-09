[**@stynx-nyx/data**](../index.md)

---

[@stynx-nyx/data](../index.md) / TxOptions

# Interface: TxOptions

Defined in: [packages/data/src/types.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/types.ts#L4)

## Properties

### deadlineMs?

> `optional` **deadlineMs?**: `number`

Defined in: [packages/data/src/types.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/types.ts#L10)

---

### isolation?

> `optional` **isolation?**: `"read uncommitted"` \| `"read committed"` \| `"repeatable read"` \| `"serializable"`

Defined in: [packages/data/src/types.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/types.ts#L5)

---

### readonly?

> `optional` **readonly?**: `boolean`

Defined in: [packages/data/src/types.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/types.ts#L6)

---

### replica?

> `optional` **replica?**: `boolean`

Defined in: [packages/data/src/types.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/types.ts#L8)

---

### retry?

> `optional` **retry?**: `false` \| \{ `attempts`: `number`; `jitterMs`: \[`number`, `number`\]; \}

Defined in: [packages/data/src/types.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/types.ts#L9)

---

### role?

> `optional` **role?**: [`StynxDataRole`](../type-aliases/StynxDataRole.md)

Defined in: [packages/data/src/types.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/types.ts#L7)
