import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { type SQL, type SQLWrapper } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  ArchiveMirrorMissingError,
  ReadOnlyViolationError,
  TransactionRequiredError,
} from './errors';
import {
  describeBlockingChildren as describeBlockingChildrenInternal,
  ensureMirrorExists as ensureMirrorExistsInternal,
  findArchivedParents as findArchivedParentsInternal,
  findRestoreConflict as findRestoreConflictInternal,
  listChildIds as listChildIdsInternal,
  loadArchivedRow as loadArchivedRowInternal,
  loadColumnNames as loadColumnNamesInternal,
  loadRegistryByChild as loadRegistryByChildInternal,
  loadRegistryByParent as loadRegistryByParentInternal,
  type ArchivedParent,
  type ArchiveLookupRow,
  type RegistryEntry,
} from './internal/archive-relations';
import { restoreByReference as restoreByReferenceInternal } from './internal/archive-restore';
import {
  buildCascadePlan as buildCascadePlanInternal,
  softDeleteByReference as softDeleteByReferenceInternal,
} from './internal/soft-delete-cascade';
import { getTableMeta, qualifiedName, type TableMeta } from './internal/table-meta';
import { createTransactionSelectRoot, type TransactionSelectRoot } from './query-helpers';
import * as schema from './schema';
import { isSoftDeletable } from './table-markers';
import type { StynxDataMetricsSink, StynxDataRole } from './tokens';
import type {
  CascadePlan,
  HardDeleteFromArchiveOptions,
  HardDeleteOptions,
  LiveOnlyTable,
  RestoreOptions,
  RestoreResult,
  SoftDeleteOptions,
  SoftDeleteResult,
  SoftDeletableTable,
} from './types';

export type StynxDrizzleDatabase = NodePgDatabase<typeof schema>;

export function createDrizzle(client: PoolClient): StynxDrizzleDatabase {
  return drizzle(client, { schema });
}

function ensureWritableRole(role: StynxDataRole): void {
  if (role === 'reader') {
    throw new ReadOnlyViolationError({ role });
  }
}

function parseArchiveTableName(archiveTable: string): string {
  if (archiveTable.includes('.')) {
    const [schemaName, tableName] = archiveTable.split('.');
    if (schemaName && tableName) {
      return qualifiedName(schemaName, tableName);
    }
  }
  return qualifiedName('archive', archiveTable);
}

export class Transaction {
  private active = true;

  constructor(
    private readonly client: PoolClient,
    private readonly db: StynxDrizzleDatabase,
    readonly role: StynxDataRole,
    private readonly metrics?: StynxDataMetricsSink,
  ) {}

  close(): void {
    this.active = false;
  }

  select(): TransactionSelectRoot {
    this.ensureActive();
    return createTransactionSelectRoot(this.client, () => this.db.select());
  }

  insert = <TTable extends Parameters<StynxDrizzleDatabase['insert']>[0]>(table: TTable) => {
    this.ensureActive();
    return this.db.insert(table);
  };

  update = <TTable extends Parameters<StynxDrizzleDatabase['update']>[0]>(table: TTable) => {
    this.ensureActive();
    return this.db.update(table);
  };

  delete = <TTable extends Parameters<StynxDrizzleDatabase['delete']>[0]>(table: TTable) => {
    this.ensureActive();
    return this.db.delete(table);
  };

  async execute(query: SQLWrapper): Promise<QueryResult<QueryResultRow>> {
    this.ensureActive();
    return this.db.execute(query as SQL<unknown>);
  }

  async query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<TRow>> {
    this.ensureActive();
    return this.client.query<TRow>(text, values);
  }

  async softDelete<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options: SoftDeleteOptions & { dryRun: true },
  ): Promise<CascadePlan>;
  async softDelete<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options?: SoftDeleteOptions,
  ): Promise<SoftDeleteResult>;
  async softDelete<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options: SoftDeleteOptions = {},
  ): Promise<CascadePlan | SoftDeleteResult> {
    this.ensureActive();
    ensureWritableRole(this.role);
    if (!isSoftDeletable(table)) {
      throw new ArchiveMirrorMissingError({ table: getTableMeta(table).qualifiedName });
    }

    const meta = getTableMeta(table);
    await this.ensureMirrorExists(meta);

    const maxCascadeDepth = options.maxCascadeDepth ?? 4;
    const maxCascadeRows = options.maxCascadeRows ?? 100;
    const plan = await this.buildCascadePlan(meta, id, maxCascadeDepth, maxCascadeRows);

    if (options.dryRun) {
      return plan;
    }

    const deletedAt = new Date().toISOString();
    const cascaded: Array<{ schema: string; table: string; archiveId: bigint; id: string }> = [];
    await this.softDeleteByReference(
      meta,
      id,
      deletedAt,
      maxCascadeDepth,
      maxCascadeRows,
      0,
      cascaded,
    );

    const root = cascaded.find(
      (entry) => entry.schema === meta.schema && entry.table === meta.table && entry.id === id,
    );
    return {
      archiveId: root?.archiveId ?? 0n,
      cascaded: cascaded.filter(
        (entry) => !(entry.schema === meta.schema && entry.table === meta.table && entry.id === id),
      ),
      deletedAt,
    };
  }

  async restoreFromArchive<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options: RestoreOptions = {},
  ): Promise<RestoreResult> {
    this.ensureActive();
    ensureWritableRole(this.role);
    if (!isSoftDeletable(table)) {
      throw new ArchiveMirrorMissingError({ table: getTableMeta(table).qualifiedName });
    }

    const meta = getTableMeta(table);
    await this.ensureMirrorExists(meta);
    return this.restoreByReference(meta, id, options, []);
  }

  async restoreWithCascade<T extends AnyPgTable>(
    table: SoftDeletableTable<T>,
    id: string,
    options: Omit<RestoreOptions, 'cascade'> = {},
  ): Promise<RestoreResult> {
    return this.restoreFromArchive(table, id, {
      ...options,
      cascade: true,
    });
  }

  async hardDelete<T extends AnyPgTable>(
    table: SoftDeletableTable<T> | LiveOnlyTable<T>,
    id: string,
    options: HardDeleteOptions,
  ): Promise<void> {
    this.ensureActive();
    ensureWritableRole(this.role);
    this.assertHardDeleteConfirmation(options);

    const meta = getTableMeta(table as AnyPgTable);
    await this.query(`delete from ${meta.qualifiedName} where id = $1`, [id]);
    this.metrics?.incrementHardDelete(this.metricLabel(meta));
  }

  async hardDeleteFromArchive(
    archiveId: bigint,
    options: HardDeleteFromArchiveOptions,
  ): Promise<void> {
    this.ensureActive();
    ensureWritableRole(this.role);
    this.assertHardDeleteConfirmation(options);

    await this.query(
      `delete from ${parseArchiveTableName(options.archiveTable)} where archive_id = $1`,
      [archiveId.toString()],
    );
    this.metrics?.incrementHardDelete(options.archiveTable);
    await this.sampleArchiveSizeByName(
      options.archiveTable,
      this.normalizeArchiveMetricLabel(options.archiveTable),
    );
  }

  private async buildCascadePlan(
    meta: TableMeta,
    id: string,
    maxCascadeDepth: number,
    maxCascadeRows: number,
    depth = 0,
  ): Promise<CascadePlan> {
    return buildCascadePlanInternal(
      this.softDeleteContext(),
      meta,
      id,
      maxCascadeDepth,
      maxCascadeRows,
      depth,
    );
  }

  private async softDeleteByReference(
    meta: TableMeta,
    id: string,
    deletedAt: string,
    maxCascadeDepth: number,
    maxCascadeRows: number,
    depth: number,
    cascaded: Array<{ schema: string; table: string; archiveId: bigint; id: string }>,
  ): Promise<void> {
    await softDeleteByReferenceInternal(
      this.softDeleteContext(),
      meta,
      id,
      deletedAt,
      maxCascadeDepth,
      maxCascadeRows,
      depth,
      cascaded,
    );
  }

  private async restoreByReference(
    meta: TableMeta,
    id: string,
    options: RestoreOptions,
    restoredChildren: Array<{ schema: string; table: string; id: string }>,
  ): Promise<RestoreResult> {
    return restoreByReferenceInternal(this.restoreContext(), meta, id, options, restoredChildren);
  }

  private softDeleteContext() {
    return {
      query: this.query.bind(this),
      ensureMirrorExists: this.ensureMirrorExists.bind(this),
      loadRegistryByParent: this.loadRegistryByParent.bind(this),
      listChildIds: this.listChildIds.bind(this),
      loadColumnNames: this.loadColumnNames.bind(this),
      describeBlockingChildren: this.describeBlockingChildren.bind(this),
      sampleArchiveSize: this.sampleArchiveSize.bind(this),
      metricLabel: this.metricLabel.bind(this),
      incrementSoftDelete: (label: string) => this.metrics?.incrementSoftDelete(label),
      softDeleteByReference: this.softDeleteByReference.bind(this),
      buildCascadePlan: this.buildCascadePlan.bind(this),
    };
  }

  private restoreContext() {
    return {
      query: this.query.bind(this),
      loadArchivedRow: this.loadArchivedRow.bind(this),
      findArchivedParents: this.findArchivedParents.bind(this),
      findRestoreConflict: this.findRestoreConflict.bind(this),
      loadRegistryByParent: this.loadRegistryByParent.bind(this),
      loadColumnNames: this.loadColumnNames.bind(this),
      sampleArchiveSize: this.sampleArchiveSize.bind(this),
      incrementRestore: (label: string) => this.metrics?.incrementRestore(label),
      metricLabel: this.metricLabel.bind(this),
      restoreByReference: this.restoreByReference.bind(this),
    };
  }

  private async loadRegistryByParent(
    parentSchema: string,
    parentTable: string,
  ): Promise<RegistryEntry[]> {
    return loadRegistryByParentInternal(this, parentSchema, parentTable);
  }

  private async loadRegistryByChild(
    childSchema: string,
    childTable: string,
  ): Promise<RegistryEntry[]> {
    return loadRegistryByChildInternal(this, childSchema, childTable);
  }

  private async listChildIds(entry: RegistryEntry, parentId: string): Promise<string[]> {
    return listChildIdsInternal(this, entry, parentId);
  }

  private async describeBlockingChildren(
    meta: TableMeta,
    id: string,
  ): Promise<Array<Record<string, unknown>>> {
    return describeBlockingChildrenInternal(
      {
        query: this.query.bind(this),
        loadRegistryByParent: this.loadRegistryByParent.bind(this),
      },
      meta,
      id,
    );
  }

  private async loadArchivedRow(
    meta: TableMeta,
    id: string,
    archiveId?: bigint,
  ): Promise<ArchiveLookupRow | undefined> {
    return loadArchivedRowInternal(this, meta, id, archiveId);
  }

  private async findArchivedParents(
    meta: TableMeta,
    rowData: Record<string, unknown>,
  ): Promise<ArchivedParent[]> {
    return findArchivedParentsInternal(
      {
        query: this.query.bind(this),
        loadRegistryByChild: this.loadRegistryByChild.bind(this),
      },
      meta,
      rowData,
    );
  }

  private async findRestoreConflict(
    meta: TableMeta,
    rowData: Record<string, unknown>,
    id: string,
  ): Promise<Record<string, unknown> | undefined> {
    return findRestoreConflictInternal(this, meta, rowData, id);
  }

  private async loadColumnNames(schemaName: string, tableName: string): Promise<string[]> {
    return loadColumnNamesInternal(this, schemaName, tableName);
  }

  private async ensureMirrorExists(meta: TableMeta): Promise<void> {
    await ensureMirrorExistsInternal(this, meta);
  }

  private metricLabel(meta: TableMeta): string {
    return `${meta.schema}.${meta.table}`;
  }

  private async sampleArchiveSize(meta: TableMeta): Promise<void> {
    await this.sampleArchiveSizeByName(meta.mirrorQualifiedName, this.metricLabel(meta));
  }

  private async sampleArchiveSizeByName(
    qualifiedRelationName: string,
    label = qualifiedRelationName,
  ): Promise<void> {
    if (!this.metrics) {
      return;
    }

    const size = await this.query<{ bytes: string }>(
      `select pg_total_relation_size($1::regclass)::text as bytes`,
      [qualifiedRelationName.replaceAll('"', '')],
    );
    const bytes = Number.parseInt(size.rows[0]?.bytes ?? '0', 10);
    if (Number.isFinite(bytes)) {
      this.metrics.setArchiveSizeBytes(label, bytes);
    }
  }

  private normalizeArchiveMetricLabel(archiveTable: string): string {
    const qualified = archiveTable.replaceAll('"', '');
    const [schemaName, tableName] = qualified.split('.');
    if (schemaName !== 'archive' || !tableName) {
      return qualified;
    }

    const separator = tableName.indexOf('_');
    if (separator <= 0 || separator === tableName.length - 1) {
      return qualified;
    }

    return `${tableName.slice(0, separator)}.${tableName.slice(separator + 1)}`;
  }

  private assertHardDeleteConfirmation(
    options: HardDeleteOptions | HardDeleteFromArchiveOptions,
  ): void {
    if (options.confirm !== 'I understand this is irrecoverable') {
      throw new ReadOnlyViolationError({ reason: 'hard-delete-confirmation-mismatch' });
    }
  }

  private ensureActive(): void {
    if (!this.active) {
      throw new TransactionRequiredError();
    }
  }
}
