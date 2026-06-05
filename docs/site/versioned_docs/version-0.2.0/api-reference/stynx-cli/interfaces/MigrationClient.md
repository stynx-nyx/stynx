[**@stynx/cli**](../index.md)

---

[@stynx/cli](../index.md) / MigrationClient

# Interface: MigrationClient

Defined in: [migrate.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/migrate.ts#L5)

## Methods

### connect()

> **connect**(): `Promise`\<`void`\>

Defined in: [migrate.ts:6](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/migrate.ts#L6)

#### Returns

`Promise`\<`void`\>

---

### end()

> **end**(): `Promise`\<`void`\>

Defined in: [migrate.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/migrate.ts#L7)

#### Returns

`Promise`\<`void`\>

---

### query()

> **query**(`sql`, `values?`): `Promise`\<\{ `rowCount?`: `number` \| `null`; `rows`: `unknown`[]; \}\>

Defined in: [migrate.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/migrate.ts#L8)

#### Parameters

##### sql

`string`

##### values?

`unknown`[]

#### Returns

`Promise`\<\{ `rowCount?`: `number` \| `null`; `rows`: `unknown`[]; \}\>
