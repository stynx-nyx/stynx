[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / AuditMetadataRedactionPolicy

# Interface: AuditMetadataRedactionPolicy

Defined in: [packages/backend/src/audit/redaction-policy.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/redaction-policy.ts#L11)

## Methods

### redact()

> **redact**(`metadata`, `context`): `Record`\<`string`, `unknown`\> \| `undefined`

Defined in: [packages/backend/src/audit/redaction-policy.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/redaction-policy.ts#L12)

#### Parameters

##### metadata

`Record`\<`string`, `unknown`\> \| `undefined`

##### context

[`AuditMetadataRedactionContext`](AuditMetadataRedactionContext.md)

#### Returns

`Record`\<`string`, `unknown`\> \| `undefined`
