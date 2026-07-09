[**@stynx-nyx/cli**](../index.md)

---

[@stynx-nyx/cli](../index.md) / AuditVerifyClient

# Interface: AuditVerifyClient

Defined in: [audit.ts:3](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/audit.ts#L3)

## Methods

### connect()

> **connect**(): `Promise`\<`void`\>

Defined in: [audit.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/audit.ts#L4)

#### Returns

`Promise`\<`void`\>

---

### end()

> **end**(): `Promise`\<`void`\>

Defined in: [audit.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/audit.ts#L5)

#### Returns

`Promise`\<`void`\>

---

### query()

> **query**\<`T`\>(`sql`, `values?`): `Promise`\<\{ `rowCount?`: `number` \| `null`; `rows`: `T`[]; \}\>

Defined in: [audit.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/audit.ts#L6)

#### Type Parameters

##### T

`T` = `unknown`

#### Parameters

##### sql

`string`

##### values?

`unknown`[]

#### Returns

`Promise`\<\{ `rowCount?`: `number` \| `null`; `rows`: `T`[]; \}\>
