import type { SQLWrapper } from 'drizzle-orm';
import type { StynxDataRole } from './tokens';

export interface TxOptions {
  isolation?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
  readonly?: boolean;
  role?: StynxDataRole;
  replica?: boolean;
  retry?: { attempts: number; jitterMs: [number, number] } | false;
  deadlineMs?: number;
}

export interface SoftDeleteOptions {
  maxCascadeDepth?: number;
  maxCascadeRows?: number;
  dryRun?: boolean;
  auditTags?: Record<string, unknown>;
}

export interface RestoreOptions {
  archiveId?: bigint;
  cascade?: boolean;
  auditTags?: Record<string, unknown>;
}

export interface HardDeleteOptions {
  confirm: 'I understand this is irrecoverable';
  auditTags?: Record<string, unknown>;
}

export interface HardDeleteFromArchiveOptions extends HardDeleteOptions {
  archiveTable: string;
}

export interface CascadePlan {
  parent: { schema: string; table: string; id: string };
  steps: Array<{
    schema: string;
    table: string;
    rowCount: number;
    fkBehavior: 'cascade';
  }>;
  totalRows: number;
  maxDepth: number;
  withinLimits: boolean;
}

export interface SoftDeleteResult {
  archiveId: bigint;
  cascaded: Array<{ schema: string; table: string; archiveId: bigint; id: string }>;
  deletedAt: string;
}

export interface RestoreResult {
  id: string;
  restoredAt: string;
  cascadeChildren?: Array<{ schema: string; table: string; id: string }>;
}

export type FkBehavior = 'hide' | 'cascade' | 'block';
export type QueryBuilder = SQLWrapper;
export type SoftDeletableTable<T> = T & { __stynxSoftDeletable: true };
export type LiveOnlyTable<T> = T & { __stynxLiveOnly: true };
