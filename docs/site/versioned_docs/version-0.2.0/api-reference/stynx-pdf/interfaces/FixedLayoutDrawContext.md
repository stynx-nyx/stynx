[**@stynx/pdf**](../index.md)

---

[@stynx/pdf](../index.md) / FixedLayoutDrawContext

# Interface: FixedLayoutDrawContext

Defined in: [packages/pdf/src/fixed-layout/types.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/types.ts#L14)

## Properties

### fonts

> **fonts**: [`FixedLayoutFonts`](FixedLayoutFonts.md)

Defined in: [packages/pdf/src/fixed-layout/types.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/types.ts#L16)

---

### margin

> **margin**: `number`

Defined in: [packages/pdf/src/fixed-layout/types.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/types.ts#L17)

---

### page

> **page**: `PDFPage`

Defined in: [packages/pdf/src/fixed-layout/types.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/types.ts#L15)

---

### y

> **y**: `number`

Defined in: [packages/pdf/src/fixed-layout/types.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/types.ts#L18)

## Methods

### drawLine()

> **drawLine**(`offsetY?`): `void`

Defined in: [packages/pdf/src/fixed-layout/types.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/types.ts#L20)

#### Parameters

##### offsetY?

`number`

#### Returns

`void`

---

### drawText()

> **drawText**(`text`, `x`, `size?`, `font?`): `void`

Defined in: [packages/pdf/src/fixed-layout/types.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/types.ts#L19)

#### Parameters

##### text

`string`

##### x

`number`

##### size?

`number`

##### font?

`PDFFont`

#### Returns

`void`

---

### moveY()

> **moveY**(`delta`): `void`

Defined in: [packages/pdf/src/fixed-layout/types.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/types.ts#L21)

#### Parameters

##### delta

`number`

#### Returns

`void`
