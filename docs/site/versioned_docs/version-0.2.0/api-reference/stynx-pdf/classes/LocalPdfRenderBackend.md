[**@stynx/pdf**](../index.md)

---

[@stynx/pdf](../index.md) / LocalPdfRenderBackend

# Class: LocalPdfRenderBackend

Defined in: [packages/pdf/src/local-backend.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/local-backend.ts#L7)

## Implements

- [`PdfRenderBackend`](../interfaces/PdfRenderBackend.md)

## Constructors

### Constructor

> **new LocalPdfRenderBackend**(`options?`): `LocalPdfRenderBackend`

Defined in: [packages/pdf/src/local-backend.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/local-backend.ts#L8)

#### Parameters

##### options?

[`LocalPdfRendererOptions`](../interfaces/LocalPdfRendererOptions.md) = `{}`

#### Returns

`LocalPdfRenderBackend`

## Methods

### render()

> **render**\<`TData`\>(`request`): `Promise`\<[`RenderResult`](../interfaces/RenderResult.md)\>

Defined in: [packages/pdf/src/local-backend.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/local-backend.ts#L10)

#### Type Parameters

##### TData

`TData` _extends_ `Record`\<`string`, `unknown`\>

#### Parameters

##### request

[`RenderRequest`](../interfaces/RenderRequest.md)\<`TData`\>

#### Returns

`Promise`\<[`RenderResult`](../interfaces/RenderResult.md)\>

#### Implementation of

[`PdfRenderBackend`](../interfaces/PdfRenderBackend.md).[`render`](../interfaces/PdfRenderBackend.md#render)
