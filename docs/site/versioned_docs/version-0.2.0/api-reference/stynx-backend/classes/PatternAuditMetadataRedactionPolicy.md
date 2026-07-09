[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / PatternAuditMetadataRedactionPolicy

# Class: PatternAuditMetadataRedactionPolicy

Defined in: [packages/backend/src/audit/redaction-policy.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/redaction-policy.ts#L32)

Generic key-pattern metadata redaction policy derived from SGP production behavior.

## Implements

- [`AuditMetadataRedactionPolicy`](../interfaces/AuditMetadataRedactionPolicy.md)

## Constructors

### Constructor

> **new PatternAuditMetadataRedactionPolicy**(`options?`): `PatternAuditMetadataRedactionPolicy`

Defined in: [packages/backend/src/audit/redaction-policy.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/redaction-policy.ts#L39)

#### Parameters

##### options?

[`PatternAuditMetadataRedactionPolicyOptions`](../interfaces/PatternAuditMetadataRedactionPolicyOptions.md) = `{}`

#### Returns

`PatternAuditMetadataRedactionPolicy`

## Methods

### redact()

> **redact**(`metadata`, `_context`): `Record`\<`string`, `unknown`\> \| `undefined`

Defined in: [packages/backend/src/audit/redaction-policy.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/redaction-policy.ts#L47)

#### Parameters

##### metadata

`Record`\<`string`, `unknown`\> \| `undefined`

##### \_context

[`AuditMetadataRedactionContext`](../interfaces/AuditMetadataRedactionContext.md)

#### Returns

`Record`\<`string`, `unknown`\> \| `undefined`

#### Implementation of

[`AuditMetadataRedactionPolicy`](../interfaces/AuditMetadataRedactionPolicy.md).[`redact`](../interfaces/AuditMetadataRedactionPolicy.md#redact)
