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
