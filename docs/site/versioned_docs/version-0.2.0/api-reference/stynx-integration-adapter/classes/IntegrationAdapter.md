[**@stynx/integration-adapter**](../index.md)

---

[@stynx/integration-adapter](../index.md) / IntegrationAdapter

# Class: IntegrationAdapter\<TReq, TRaw, TRes\>

Defined in: [index.ts:139](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L139)

## Type Parameters

### TReq

`TReq`

### TRaw

`TRaw`

### TRes

`TRes`

## Constructors

### Constructor

> **new IntegrationAdapter**\<`TReq`, `TRaw`, `TRes`\>(`options`): `IntegrationAdapter`\<`TReq`, `TRaw`, `TRes`\>

Defined in: [index.ts:146](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L146)

#### Parameters

##### options

[`IntegrationAdapterOptions`](../interfaces/IntegrationAdapterOptions.md)\<`TReq`, `TRaw`, `TRes`\>

#### Returns

`IntegrationAdapter`\<`TReq`, `TRaw`, `TRes`\>

## Methods

### execute()

> **execute**(`input`, `context?`): `Promise`\<`TRes`\>

Defined in: [index.ts:155](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L155)

#### Parameters

##### input

`TReq`

##### context?

[`IntegrationContext`](../interfaces/IntegrationContext.md) = `{}`

#### Returns

`Promise`\<`TRes`\>
