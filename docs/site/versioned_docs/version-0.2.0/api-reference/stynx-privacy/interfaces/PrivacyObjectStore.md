[**@stynx-nyx/privacy**](../index.md)

---

[@stynx-nyx/privacy](../index.md) / PrivacyObjectStore

# Interface: PrivacyObjectStore

Defined in: [packages/privacy/src/types.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/types.ts#L39)

## Methods

### presignDownload()

> **presignDownload**(`input`): `Promise`\<`string`\>

Defined in: [packages/privacy/src/types.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/types.ts#L46)

#### Parameters

##### input

###### expiresInSeconds

`number`

###### key

`string`

#### Returns

`Promise`\<`string`\>

---

### putObject()

> **putObject**(`input`): `Promise`\<`void`\>

Defined in: [packages/privacy/src/types.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/privacy/src/types.ts#L40)

#### Parameters

##### input

###### body

`Buffer`

###### contentType

`string`

###### expiresAt?

`Date`

###### key

`string`

#### Returns

`Promise`\<`void`\>
