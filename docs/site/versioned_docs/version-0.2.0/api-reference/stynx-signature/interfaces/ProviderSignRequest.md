[**@stynx-nyx/signature**](../index.md)

---

[@stynx-nyx/signature](../index.md) / ProviderSignRequest

# Interface: ProviderSignRequest

Defined in: [packages/signature/src/types.ts:115](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L115)

## Properties

### actorId

> **actorId**: `string`

Defined in: [packages/signature/src/types.ts:117](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L117)

---

### algorithm

> **algorithm**: [`SignatureAlgorithm`](../type-aliases/SignatureAlgorithm.md)

Defined in: [packages/signature/src/types.ts:123](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L123)

---

### certificate

> **certificate**: [`SignatureCertificateRef`](SignatureCertificateRef.md)

Defined in: [packages/signature/src/types.ts:121](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L121)

---

### credential?

> `optional` **credential?**: [`SignatureCredentialRef`](SignatureCredentialRef.md)

Defined in: [packages/signature/src/types.ts:122](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L122)

---

### digestAlgorithm

> **digestAlgorithm**: `"sha256"`

Defined in: [packages/signature/src/types.ts:124](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L124)

---

### document

> **document**: `Uint8Array`

Defined in: [packages/signature/src/types.ts:118](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L118)

---

### documentSha256

> **documentSha256**: `string`

Defined in: [packages/signature/src/types.ts:119](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L119)

---

### idempotencyKey?

> `optional` **idempotencyKey?**: `string`

Defined in: [packages/signature/src/types.ts:125](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L125)

---

### metadata?

> `optional` **metadata?**: `Record`\<`string`, `string`\>

Defined in: [packages/signature/src/types.ts:126](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L126)

---

### tenantId

> **tenantId**: `string`

Defined in: [packages/signature/src/types.ts:116](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L116)

---

### tsa

> **tsa**: [`TsaOptions`](TsaOptions.md)

Defined in: [packages/signature/src/types.ts:120](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L120)
