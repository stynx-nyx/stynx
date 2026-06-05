[**@stynx/data**](../index.md)

---

[@stynx/data](../index.md) / StynxDataMigrationOptions

# Interface: StynxDataMigrationOptions

Defined in: [packages/data/src/tokens.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/tokens.ts#L18)

## Properties

### enabled?

> `optional` **enabled?**: `boolean`

Defined in: [packages/data/src/tokens.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/tokens.ts#L19)

---

### runner?

> `optional` **runner?**: (`pools`) => `Promise`\<`void`\>

Defined in: [packages/data/src/tokens.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/tokens.ts#L20)

#### Parameters

##### pools

`Record`\<[`StynxDataRole`](../type-aliases/StynxDataRole.md), `Pool`\>

#### Returns

`Promise`\<`void`\>
