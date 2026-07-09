[**@stynx-nyx/signature**](../index.md)

---

[@stynx-nyx/signature](../index.md) / VerifyResult

# Interface: VerifyResult

Defined in: [packages/signature/src/types.ts:81](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L81)

## Properties

### certificateChainPem?

> `optional` **certificateChainPem?**: `string`[]

Defined in: [packages/signature/src/types.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L88)

---

### checkedAt

> **checkedAt**: `Date`

Defined in: [packages/signature/src/types.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L84)

---

### documentSha256

> **documentSha256**: `string`

Defined in: [packages/signature/src/types.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L83)

---

### reasons

> **reasons**: `string`[]

Defined in: [packages/signature/src/types.ts:89](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L89)

---

### revocationCheckedAt?

> `optional` **revocationCheckedAt?**: `Date`

Defined in: [packages/signature/src/types.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L87)

---

### revocationSource

> **revocationSource**: [`RevocationSource`](../type-aliases/RevocationSource.md)

Defined in: [packages/signature/src/types.ts:86](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L86)

---

### signerCertificate?

> `optional` **signerCertificate?**: [`SignatureCertificateRef`](SignatureCertificateRef.md)

Defined in: [packages/signature/src/types.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L85)

---

### status

> **status**: `"valid"` \| `"invalid"` \| `"unknown"`

Defined in: [packages/signature/src/types.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L82)
