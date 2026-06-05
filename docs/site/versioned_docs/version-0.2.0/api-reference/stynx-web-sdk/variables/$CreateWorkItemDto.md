[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / $CreateWorkItemDto

# Variable: $CreateWorkItemDto

> `const` **$CreateWorkItemDto**: `object`

Defined in: [packages-web/sdk/src/generated/schemas/$CreateWorkItemDto.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/schemas/$CreateWorkItemDto.ts#L5)

## Type Declaration

### properties

> `readonly` **properties**: `object`

#### properties.category

> `readonly` **category**: `object`

#### properties.category.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.code

> `readonly` **code**: `object`

#### properties.code.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.code.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.createdByUserId

> `readonly` **createdByUserId**: `object`

#### properties.createdByUserId.contains

> `readonly` **contains**: readonly \[\{ `type`: `"string"`; \}, \{ `type`: `"null"`; \}\]

#### properties.createdByUserId.type

> `readonly` **type**: `"any-of"` = `'any-of'`

#### properties.openedOn

> `readonly` **openedOn**: `object`

#### properties.openedOn.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.openedOn.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.recordId

> `readonly` **recordId**: `object`

#### properties.recordId.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.recordId.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.status

> `readonly` **status**: `object`

#### properties.status.type

> `readonly` **type**: `"Enum"` = `'Enum'`

#### properties.targetOn

> `readonly` **targetOn**: `object`

#### properties.targetOn.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.targetOn.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.totalUnits

> `readonly` **totalUnits**: `object`

#### properties.totalUnits.type

> `readonly` **type**: `"number"` = `'number'`
