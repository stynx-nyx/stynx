[**@stynx/signature**](../index.md)

---

[@stynx/signature](../index.md) / SignatureRequest

# Interface: SignatureRequest

Defined in: [packages/signature/src/types.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L38)

## Properties

### actorId

> **actorId**: `string`

Defined in: [packages/signature/src/types.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L40)

---

### algorithm?

> `optional` **algorithm?**: [`SignatureAlgorithm`](../type-aliases/SignatureAlgorithm.md)

Defined in: [packages/signature/src/types.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L46)

---

### certificate

> **certificate**: [`SignatureCertificateRef`](SignatureCertificateRef.md)

Defined in: [packages/signature/src/types.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L44)

---

### credential?

> `optional` **credential?**: [`SignatureCredentialRef`](SignatureCredentialRef.md)

Defined in: [packages/signature/src/types.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L45)

---

### digestAlgorithm?

> `optional` **digestAlgorithm?**: `"sha256"`

Defined in: [packages/signature/src/types.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L47)

---

### document

> **document**: `Uint8Array`

Defined in: [packages/signature/src/types.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L41)

---

### documentSha256

> **documentSha256**: `string`

Defined in: [packages/signature/src/types.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L42)

---

### idempotencyKey?

> `optional` **idempotencyKey?**: `string`

Defined in: [packages/signature/src/types.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L48)

---

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `string`\>

Defined in: [packages/signature/src/types.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L49)

---

### tenantId

> **tenantId**: `string`

Defined in: [packages/signature/src/types.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L39)

---

### tsa

> **tsa**: [`TsaOptions`](TsaOptions.md)

Defined in: [packages/signature/src/types.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L43)
