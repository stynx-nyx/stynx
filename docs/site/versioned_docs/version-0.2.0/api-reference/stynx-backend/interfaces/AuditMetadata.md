[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / AuditMetadata

# Interface: AuditMetadata

Defined in: [packages/backend/src/audit/decorators.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/decorators.ts#L4)

## Properties

### action

> **action**: `string`

Defined in: [packages/backend/src/audit/decorators.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/decorators.ts#L5)

---

### entity?

> `optional` **entity?**: `string`

Defined in: [packages/backend/src/audit/decorators.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/decorators.ts#L6)

---

### entityIdSelector?

> `optional` **entityIdSelector?**: (`request`) => `string` \| `undefined`

Defined in: [packages/backend/src/audit/decorators.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/decorators.ts#L7)

#### Parameters

##### request

`unknown`

#### Returns

`string` \| `undefined`

---

### metadataSelector?

> `optional` **metadataSelector?**: (`request`) => `Record`\<`string`, `unknown`\> \| `undefined`

Defined in: [packages/backend/src/audit/decorators.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/decorators.ts#L8)

#### Parameters

##### request

`unknown`

#### Returns

`Record`\<`string`, `unknown`\> \| `undefined`
