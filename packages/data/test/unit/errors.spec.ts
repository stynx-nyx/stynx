// @ts-nocheck
import {
  ActorContextMissingError,
  ArchiveMirrorDriftError,
  ArchiveMirrorMissingError,
  CascadeTooDeepError,
  CascadeTooLargeError,
  ReadOnlyViolationError,
  SerializationFailureError,
  RestoreCascadeParentsArchivedError,
  RestoreConflictError,
  SoftDeleteBlockedError,
  StatementTimeoutError,
  TenantContextMissingError,
  TransactionRequiredError,
} from '../../src/errors';

describe('data errors', () => {
  it('exposes stable error codes and context', () => {
    expect(new TenantContextMissingError()).toMatchObject({ code: 'TENANT_CONTEXT_MISSING', status: 500 });
    expect(new ActorContextMissingError()).toMatchObject({ code: 'ACTOR_CONTEXT_MISSING', status: 500 });
    expect(new TransactionRequiredError()).toMatchObject({ code: 'TRANSACTION_REQUIRED', status: 500 });
    expect(new ReadOnlyViolationError({ sql: 'delete' })).toMatchObject({ code: 'READONLY_VIOLATION', context: { sql: 'delete' } });
    expect(new CascadeTooDeepError({ depth: 4 })).toMatchObject({ code: 'CASCADE_TOO_DEEP', status: 409 });
    expect(new CascadeTooLargeError({ rows: 10 })).toMatchObject({ code: 'CASCADE_TOO_LARGE', status: 409 });
    expect(new SoftDeleteBlockedError({ table: 'child' })).toMatchObject({ code: 'SOFT_DELETE_BLOCKED_BY_CHILDREN', status: 409 });
    expect(new RestoreConflictError({ id: '1' })).toMatchObject({ code: 'RESTORE_CONFLICT', status: 409 });
    expect(new RestoreCascadeParentsArchivedError({ parent: 'p' })).toMatchObject({ code: 'RESTORE_HAS_ARCHIVED_CASCADE_PARENTS', status: 409 });
    expect(new ArchiveMirrorMissingError({ table: 'archive.t' })).toMatchObject({ code: 'ARCHIVE_MIRROR_MISSING', status: 500 });
    expect(new ArchiveMirrorDriftError({ table: 'archive.t' })).toMatchObject({ code: 'ARCHIVE_MIRROR_DRIFT', status: 500 });
    expect(new StatementTimeoutError({ timeoutMs: 100 })).toMatchObject({ code: 'STATEMENT_TIMEOUT', status: 504 });
  });

  it('omits optional error context when no context is provided', () => {
    expect(new ReadOnlyViolationError().context).toBeUndefined();
    expect(new StatementTimeoutError().context).toBeUndefined();
    expect(new SerializationFailureError().context).toBeUndefined();
  });
});
