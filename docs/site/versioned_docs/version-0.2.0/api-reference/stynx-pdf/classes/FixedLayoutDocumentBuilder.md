[**@stynx/pdf**](../index.md)

---

[@stynx/pdf](../index.md) / FixedLayoutDocumentBuilder

# Class: FixedLayoutDocumentBuilder

Defined in: [packages/pdf/src/fixed-layout/fixed-layout-builder.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/fixed-layout-builder.ts#L25)

## Methods

### addPage()

> **addPage**(): `Promise`\<[`FixedLayoutDrawContext`](../interfaces/FixedLayoutDrawContext.md)\>

Defined in: [packages/pdf/src/fixed-layout/fixed-layout-builder.ts:59](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/fixed-layout-builder.ts#L59)

#### Returns

`Promise`\<[`FixedLayoutDrawContext`](../interfaces/FixedLayoutDrawContext.md)\>

---

### save()

> **save**(): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [packages/pdf/src/fixed-layout/fixed-layout-builder.ts:71](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/fixed-layout-builder.ts#L71)

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

---

### create()

> `static` **create**(`metadata`, `options?`): `Promise`\<`FixedLayoutDocumentBuilder`\>

Defined in: [packages/pdf/src/fixed-layout/fixed-layout-builder.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/fixed-layout/fixed-layout-builder.ts#L32)

#### Parameters

##### metadata

[`FixedLayoutDocumentMetadata`](../interfaces/FixedLayoutDocumentMetadata.md)

##### options?

[`FixedLayoutDocumentOptions`](../interfaces/FixedLayoutDocumentOptions.md) = `{}`

#### Returns

`Promise`\<`FixedLayoutDocumentBuilder`\>
