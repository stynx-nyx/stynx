[**@stynx-nyx/audit**](../index.md)

---

[@stynx-nyx/audit](../index.md) / AuditSqlReader

# Class: AuditSqlReader

Defined in: [sql-adapter.ts:200](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/sql-adapter.ts#L200)

## Constructors

### Constructor

> **new AuditSqlReader**(`executor`, `options`): `AuditSqlReader`

Defined in: [sql-adapter.ts:201](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/sql-adapter.ts#L201)

#### Parameters

##### executor

[`SqlExecutor`](../interfaces/SqlExecutor.md)

##### options

[`AuditSqlReaderOptions`](../interfaces/AuditSqlReaderOptions.md)

#### Returns

`AuditSqlReader`

## Methods

### list()

> **list**(`query?`): `Promise`\<[`AuditSqlListResult`](../interfaces/AuditSqlListResult.md)\>

Defined in: [sql-adapter.ts:206](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/sql-adapter.ts#L206)

#### Parameters

##### query?

[`AuditSqlListQuery`](../interfaces/AuditSqlListQuery.md) = `{}`

#### Returns

`Promise`\<[`AuditSqlListResult`](../interfaces/AuditSqlListResult.md)\>
