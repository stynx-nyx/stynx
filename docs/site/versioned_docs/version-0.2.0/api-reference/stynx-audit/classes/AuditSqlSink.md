[**@stynx-nyx/audit**](../index.md)

---

[@stynx-nyx/audit](../index.md) / AuditSqlSink

# Class: AuditSqlSink

Defined in: [sql-adapter.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/sql-adapter.ts#L54)

## Implements

- `AuditSink`

## Constructors

### Constructor

> **new AuditSqlSink**(`executor`, `options`): `AuditSqlSink`

Defined in: [sql-adapter.ts:55](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/sql-adapter.ts#L55)

#### Parameters

##### executor

[`SqlExecutor`](../interfaces/SqlExecutor.md)

##### options

[`AuditSqlSinkOptions`](../interfaces/AuditSqlSinkOptions.md)

#### Returns

`AuditSqlSink`

## Methods

### write()

> **write**(`event`): `Promise`\<`void`\>

Defined in: [sql-adapter.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/sql-adapter.ts#L60)

#### Parameters

##### event

`AuditEventEnvelope`

#### Returns

`Promise`\<`void`\>

#### Implementation of

`AuditSink.write`
