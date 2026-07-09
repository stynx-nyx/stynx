[**@stynx-nyx/pdf**](../index.md)

---

[@stynx-nyx/pdf](../index.md) / PdfRenderBackend

# Interface: PdfRenderBackend

Defined in: [packages/pdf/src/types.ts:69](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/types.ts#L69)

## Methods

### render()

> **render**\<`TData`\>(`request`): `Promise`\<[`RenderResult`](RenderResult.md)\>

Defined in: [packages/pdf/src/types.ts:70](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/types.ts#L70)

#### Type Parameters

##### TData

`TData` _extends_ `Record`\<`string`, `unknown`\>

#### Parameters

##### request

[`RenderRequest`](RenderRequest.md)\<`TData`\>

#### Returns

`Promise`\<[`RenderResult`](RenderResult.md)\>
