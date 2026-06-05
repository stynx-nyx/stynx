**@stynx/audit**

---

# @stynx/audit

Public audit logging, retention, SQL sink, and test-helper exports.

## Classes

- [AuditSqlReader](classes/AuditSqlReader.md)
- [AuditSqlSink](classes/AuditSqlSink.md)
- [StynxAuditController](classes/StynxAuditController.md)
- [StynxAuditModule](classes/StynxAuditModule.md)
- [StynxAuditService](classes/StynxAuditService.md)

## Interfaces

- [AuditArchiveStore](interfaces/AuditArchiveStore.md)
- [AuditClock](interfaces/AuditClock.md)
- [AuditDetachPlan](interfaces/AuditDetachPlan.md)
- [AuditDumpRunner](interfaces/AuditDumpRunner.md)
- [AuditEvent](interfaces/AuditEvent.md)
- [AuditExpectation](interfaces/AuditExpectation.md)
- [AuditLogCursor](interfaces/AuditLogCursor.md)
- [AuditLogItem](interfaces/AuditLogItem.md)
- [AuditLogPage](interfaces/AuditLogPage.md)
- [AuditLogQuery](interfaces/AuditLogQuery.md)
- [AuditPartitionCandidate](interfaces/AuditPartitionCandidate.md)
- [AuditSqlListItem](interfaces/AuditSqlListItem.md)
- [AuditSqlListQuery](interfaces/AuditSqlListQuery.md)
- [AuditSqlListResult](interfaces/AuditSqlListResult.md)
- [AuditSqlReaderOptions](interfaces/AuditSqlReaderOptions.md)
- [AuditSqlSinkOptions](interfaces/AuditSqlSinkOptions.md)
- [ChainVerificationResult](interfaces/ChainVerificationResult.md)
- [Queryable](interfaces/Queryable.md)
- [SqlExecutor](interfaces/SqlExecutor.md)
- [StynxAuditModuleOptions](interfaces/StynxAuditModuleOptions.md)

## Variables

- [STYNX_AUDIT_ARCHIVE_STORE](variables/STYNX_AUDIT_ARCHIVE_STORE.md)
- [STYNX_AUDIT_CLOCK](variables/STYNX_AUDIT_CLOCK.md)
- [STYNX_AUDIT_DUMP_RUNNER](variables/STYNX_AUDIT_DUMP_RUNNER.md)
- [STYNX_AUDIT_OPTIONS](variables/STYNX_AUDIT_OPTIONS.md)

## Functions

- [expectAuditRow](functions/expectAuditRow.md)
- [findAuditRows](functions/findAuditRows.md)
- [planAuditDetach](functions/planAuditDetach.md)
