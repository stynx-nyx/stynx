[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / $AuditLogItem

# Variable: $AuditLogItem

> `const` **$AuditLogItem**: `object`

Defined in: [packages-web/sdk/src/generated/schemas/$AuditLogItem.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/schemas/$AuditLogItem.ts#L5)

## Type Declaration

### properties

> `readonly` **properties**: `object`

#### properties.actorId

> `readonly` **actorId**: `object`

#### properties.actorId.contains

> `readonly` **contains**: readonly \[\{ `type`: `"string"`; \}, \{ `type`: `"null"`; \}\]

#### properties.actorId.type

> `readonly` **type**: `"any-of"` = `'any-of'`

#### properties.id

> `readonly` **id**: `object`

#### properties.id.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.id.type

> `readonly` **type**: `"number"` = `'number'`

#### properties.occurredAt

> `readonly` **occurredAt**: `object`

#### properties.occurredAt.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.occurredAt.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.operation

> `readonly` **operation**: `object`

#### properties.operation.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.operation.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.payload

> `readonly` **payload**: `object`

#### properties.payload.contains

> `readonly` **contains**: `object`

#### properties.payload.contains.type

> `readonly` **type**: `"JsonValue"` = `'JsonValue'`

#### properties.payload.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.payload.type

> `readonly` **type**: `"dictionary"` = `'dictionary'`

#### properties.requestId

> `readonly` **requestId**: `object`

#### properties.requestId.contains

> `readonly` **contains**: readonly \[\{ `type`: `"string"`; \}, \{ `type`: `"null"`; \}\]

#### properties.requestId.type

> `readonly` **type**: `"any-of"` = `'any-of'`

#### properties.rowId

> `readonly` **rowId**: `object`

#### properties.rowId.contains

> `readonly` **contains**: readonly \[\{ `type`: `"string"`; \}, \{ `type`: `"null"`; \}\]

#### properties.rowId.type

> `readonly` **type**: `"any-of"` = `'any-of'`

#### properties.sessionId

> `readonly` **sessionId**: `object`

#### properties.sessionId.contains

> `readonly` **contains**: readonly \[\{ `type`: `"string"`; \}, \{ `type`: `"null"`; \}\]

#### properties.sessionId.type

> `readonly` **type**: `"any-of"` = `'any-of'`

#### properties.tableName

> `readonly` **tableName**: `object`

#### properties.tableName.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.tableName.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.tableSchema

> `readonly` **tableSchema**: `object`

#### properties.tableSchema.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.tableSchema.type

> `readonly` **type**: `"string"` = `'string'`

#### properties.tags

> `readonly` **tags**: `object`

#### properties.tags.contains

> `readonly` **contains**: `object`

#### properties.tags.contains.type

> `readonly` **type**: `"JsonValue"` = `'JsonValue'`

#### properties.tags.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.tags.type

> `readonly` **type**: `"dictionary"` = `'dictionary'`

#### properties.tenantId

> `readonly` **tenantId**: `object`

#### properties.tenantId.contains

> `readonly` **contains**: readonly \[\{ `type`: `"string"`; \}, \{ `type`: `"null"`; \}\]

#### properties.tenantId.type

> `readonly` **type**: `"any-of"` = `'any-of'`
