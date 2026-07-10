[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / $CreateWorkItemLockDto

# Variable: $CreateWorkItemLockDto

> `const` **$CreateWorkItemLockDto**: `object`

Defined in: [packages-web/sdk/src/generated/schemas/$CreateWorkItemLockDto.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/schemas/$CreateWorkItemLockDto.ts#L5)

## Type Declaration

### properties

> `readonly` **properties**: `object`

#### properties.amountUnits

> `readonly` **amountUnits**: `object`

#### properties.amountUnits.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.amountUnits.type

> `readonly` **type**: `"number"` = `'number'`

#### properties.externalRef

> `readonly` **externalRef**: `object`

#### properties.externalRef.contains

> `readonly` **contains**: readonly \[\{ `type`: `"string"`; \}, \{ `type`: `"null"`; \}\]

#### properties.externalRef.type

> `readonly` **type**: `"any-of"` = `'any-of'`

#### properties.lockedAt

> `readonly` **lockedAt**: `object`

#### properties.lockedAt.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.lockedAt.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.reason

> `readonly` **reason**: `object`

#### properties.reason.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.reason.type

> `readonly` **type**: `"Enum"` = `'Enum'`

#### properties.workItemId

> `readonly` **workItemId**: `object`

#### properties.workItemId.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.workItemId.type

> `readonly` **type**: `"string"` = `'string'`
