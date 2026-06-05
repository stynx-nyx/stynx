[**@stynx/contracts**](../index.md)

---

[@stynx/contracts](../index.md) / DocumentMetadataRepository

# Interface: DocumentMetadataRepository

Defined in: [packages/contracts/src/storage.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/storage.ts#L45)

## Methods

### deleteById()

> **deleteById**(`id`): `Promise`\<`void`\>

Defined in: [packages/contracts/src/storage.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/storage.ts#L48)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

---

### getById()

> **getById**(`id`): `Promise`\<[`DocumentMetadataRecord`](DocumentMetadataRecord.md) \| `null`\>

Defined in: [packages/contracts/src/storage.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/storage.ts#L47)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<[`DocumentMetadataRecord`](DocumentMetadataRecord.md) \| `null`\>

---

### save()

> **save**(`record`): `Promise`\<[`DocumentMetadataRecord`](DocumentMetadataRecord.md)\>

Defined in: [packages/contracts/src/storage.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/storage.ts#L46)

#### Parameters

##### record

[`DocumentMetadataRecord`](DocumentMetadataRecord.md)

#### Returns

`Promise`\<[`DocumentMetadataRecord`](DocumentMetadataRecord.md)\>
