[**@stynx-nyx/pdf**](../index.md)

---

[@stynx-nyx/pdf](../index.md) / PdfRenderer

# Class: PdfRenderer

Defined in: [packages/pdf/src/pdf-renderer.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/pdf-renderer.ts#L16)

## Constructors

### Constructor

> **new PdfRenderer**(`backend`): `PdfRenderer`

Defined in: [packages/pdf/src/pdf-renderer.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/pdf-renderer.ts#L17)

#### Parameters

##### backend

[`PdfRenderBackend`](../interfaces/PdfRenderBackend.md)

#### Returns

`PdfRenderer`

## Methods

### render()

> **render**\<`TData`\>(`request`): `Promise`\<[`RenderResult`](../interfaces/RenderResult.md)\>

Defined in: [packages/pdf/src/pdf-renderer.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/pdf-renderer.ts#L19)

#### Type Parameters

##### TData

`TData` _extends_ `Record`\<`string`, `unknown`\>

#### Parameters

##### request

[`RenderRequest`](../interfaces/RenderRequest.md)\<`TData`\>

#### Returns

`Promise`\<[`RenderResult`](../interfaces/RenderResult.md)\>
