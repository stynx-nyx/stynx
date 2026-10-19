import type { Pool } from 'pg';

export type StynxDataRole = 'owner' | 'app' | 'reader';

export interface RetryPolicy {
  attempts: number;
  jitterMs: [number, number];
}

export interface StynxDataConnectionOptions {
  connectionString?: string;
  secretId?: string;
  max?: number;
  ssl?: boolean;
  applicationName?: string;
}

export interface StynxDataMigrationOptions {
  enabled?: boolean;
  /**
   * Product role prefix applied to the platform migrations' role identifiers
   * at apply time (S-18): the roles become `<prefix>_owner`, `<prefix>_app`
   * and `<prefix>_reader`. Default `'stynx'`, which applies the files byte
   * for byte. A lower-case PostgreSQL identifier of at most 56 characters.
   * Set `appRoleName` to `<prefix>_app` alongside it.
   */
  rolePrefix?: string;
  runner?: (pools: Record<StynxDataRole, Pool>) => Promise<void>;
}

export interface StynxDataModuleOptions {
  connections: {
    owner: StynxDataConnectionOptions;
    app: StynxDataConnectionOptions;
    reader: StynxDataConnectionOptions;
  };
  retry?: RetryPolicy;
  migrations?: StynxDataMigrationOptions;
  metrics?: StynxDataMetricsSink;
  /**
   * Application SQL role expected as `current_user` on the app pool
   * (ADR-OUTBOX-0003 D1). Default `'stynx_app'`; a non-empty PostgreSQL
   * identifier of at most 63 bytes, compared by exact equality and never
   * concatenated into SQL. Its properties are verified before the pool
   * serves its first app-role transaction.
   */
  appRoleName?: string;
}

export interface StynxDataMetricsSink {
  incrementSoftDelete(table: string): void;
  incrementHardDelete(table: string): void;
  incrementRestore(table: string): void;
  setArchiveSizeBytes(table: string, bytes: number): void;
}

export const STYNX_DATA_OPTIONS = Symbol('STYNX_DATA_OPTIONS');
export const STYNX_DATA_POOLS = Symbol('STYNX_DATA_POOLS');
export const STYNX_DATA_METRICS = Symbol('STYNX_DATA_METRICS');
export const STYNX_DATABASE = Symbol.for('@stynx-nyx/data:database');
