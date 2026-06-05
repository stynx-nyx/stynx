[**@stynx/data**](../index.md)

---

[@stynx/data](../index.md) / config

# Variable: config

> `const` **config**: `PgTableWithColumns`\<\{ `columns`: \{ `key`: `PgColumn`\<\{ `baseColumn`: `never`; `columnType`: `"PgText"`; `data`: `string`; `dataType`: `"string"`; `driverParam`: `string`; `enumValues`: \[`string`, `...string[]`\]; `generated`: `undefined`; `hasDefault`: `false`; `hasRuntimeDefault`: `false`; `identity`: `undefined`; `isAutoincrement`: `false`; `isPrimaryKey`: `true`; `name`: `"key"`; `notNull`: `true`; `tableName`: `"config"`; \}, \{ \}, \{ \}\>; `tenantId`: `PgColumn`\<\{ `baseColumn`: `never`; `columnType`: `"PgUUID"`; `data`: `string`; `dataType`: `"string"`; `driverParam`: `string`; `enumValues`: `undefined`; `generated`: `undefined`; `hasDefault`: `false`; `hasRuntimeDefault`: `false`; `identity`: `undefined`; `isAutoincrement`: `false`; `isPrimaryKey`: `false`; `name`: `"tenant_id"`; `notNull`: `false`; `tableName`: `"config"`; \}, \{ \}, \{ \}\>; `updatedAt`: `PgColumn`\<\{ `baseColumn`: `never`; `columnType`: `"PgTimestamp"`; `data`: `Date`; `dataType`: `"date"`; `driverParam`: `string`; `enumValues`: `undefined`; `generated`: `undefined`; `hasDefault`: `false`; `hasRuntimeDefault`: `false`; `identity`: `undefined`; `isAutoincrement`: `false`; `isPrimaryKey`: `false`; `name`: `"updated_at"`; `notNull`: `true`; `tableName`: `"config"`; \}, \{ \}, \{ \}\>; `value`: `PgColumn`\<\{ `baseColumn`: `never`; `columnType`: `"PgJsonb"`; `data`: `unknown`; `dataType`: `"json"`; `driverParam`: `unknown`; `enumValues`: `undefined`; `generated`: `undefined`; `hasDefault`: `false`; `hasRuntimeDefault`: `false`; `identity`: `undefined`; `isAutoincrement`: `false`; `isPrimaryKey`: `false`; `name`: `"value"`; `notNull`: `true`; `tableName`: `"config"`; \}, \{ \}, \{ \}\>; \}; `dialect`: `"pg"`; `name`: `"config"`; `schema`: `"core"`; \}\>

Defined in: [packages/data/src/schema/core.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/schema/core.ts#L15)
