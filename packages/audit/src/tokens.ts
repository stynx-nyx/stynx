export const STYNX_AUDIT_OPTIONS = Symbol('STYNX_AUDIT_OPTIONS');
export const STYNX_AUDIT_CLOCK = Symbol('STYNX_AUDIT_CLOCK');
export const STYNX_AUDIT_DUMP_RUNNER = Symbol('STYNX_AUDIT_DUMP_RUNNER');
export const STYNX_AUDIT_ARCHIVE_STORE = Symbol('STYNX_AUDIT_ARCHIVE_STORE');

export interface AuditClock {
  now(): Date;
}

export interface AuditDumpRunner {
  dumpPartition(params: { schema: string; table: string; destinationPath: string }): Promise<void>;
}

export interface AuditArchiveStore {
  uploadFile(params: { bucket: string; key: string; path: string; contentType: string }): Promise<void>;
}
