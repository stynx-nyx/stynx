[**@stynx/data**](../index.md)

---

[@stynx/data](../index.md) / schemaMigrations

# Variable: schemaMigrations

> `const` **schemaMigrations**: `PgTableWithColumns`\<\{ `columns`: \{ `appliedAt`: `PgColumn`\<\{ `baseColumn`: `never`; `columnType`: `"PgTimestamp"`; `data`: `Date`; `dataType`: `"date"`; `driverParam`: `string`; `enumValues`: `undefined`; `generated`: `undefined`; `hasDefault`: `false`; `hasRuntimeDefault`: `false`; `identity`: `undefined`; `isAutoincrement`: `false`; `isPrimaryKey`: `false`; `name`: `"applied_at"`; `notNull`: `true`; `tableName`: `"schema_migrations"`; \}, \{ \}, \{ \}\>; `checksum`: `PgColumn`\<\{ `baseColumn`: `never`; `columnType`: `"PgText"`; `data`: `string`; `dataType`: `"string"`; `driverParam`: `string`; `enumValues`: \[`string`, `...string[]`\]; `generated`: `undefined`; `hasDefault`: `false`; `hasRuntimeDefault`: `false`; `identity`: `undefined`; `isAutoincrement`: `false`; `isPrimaryKey`: `false`; `name`: `"checksum"`; `notNull`: `false`; `tableName`: `"schema_migrations"`; \}, \{ \}, \{ \}\>; `id`: `PgColumn`\<\{ `baseColumn`: `never`; `columnType`: `"PgText"`; `data`: `string`; `dataType`: `"string"`; `driverParam`: `string`; `enumValues`: \[`string`, `...string[]`\]; `generated`: `undefined`; `hasDefault`: `false`; `hasRuntimeDefault`: `false`; `identity`: `undefined`; `isAutoincrement`: `false`; `isPrimaryKey`: `true`; `name`: `"id"`; `notNull`: `true`; `tableName`: `"schema_migrations"`; \}, \{ \}, \{ \}\>; \}; `dialect`: `"pg"`; `name`: `"schema_migrations"`; `schema`: `"core"`; \}\>

Defined in: [packages/data/src/schema/core.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/schema/core.ts#L45)
