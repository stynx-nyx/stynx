import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, type Transaction } from '@stynx/data';
import JSZip from 'jszip';
import { PiiMapService } from './pii-map.service';
import { generateRopaMarkdown, type RopaMetadata } from './ropa';
import { PrivacyConfigurationError, PrivacyValidationError } from './errors';
import {
  STYNX_PRIVACY_COGNITO_ADMIN,
  STYNX_PRIVACY_OBJECT_STORE,
  STYNX_PRIVACY_OPTIONS,
} from './tokens';
import type {
  PrivacyCognitoAdmin,
  PrivacyErasureRequest,
  PrivacyErasureResult,
  PrivacyExportRequest,
  PrivacyExportResult,
  PrivacyObjectStore,
  PrivacyRetentionPlanItem,
  PrivacyRetentionResult,
  PrivacyRule,
  StynxPrivacyModuleOptions,
} from './types';

interface TableSnapshot {
  table: string;
  rows: Record<string, unknown>[];
}

function quoteIdent(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new PrivacyConfigurationError('Unsafe SQL identifier', { value });
  }
  return `"${value.replace(/"/g, '""')}"`;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[",\n]/u.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function groupRules(rules: PrivacyRule[]): Map<string, PrivacyRule[]> {
  const grouped = new Map<string, PrivacyRule[]>();
  for (const rule of rules) {
    const key = `${rule.tableSchema}.${rule.tableName}`;
    const existing = grouped.get(key) ?? [];
    existing.push(rule);
    grouped.set(key, existing);
  }
  return grouped;
}

@Injectable()
export class PrivacyService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly piiMapService: PiiMapService,
    @Inject(STYNX_PRIVACY_OBJECT_STORE)
    private readonly objectStore: PrivacyObjectStore,
    @Inject(STYNX_PRIVACY_COGNITO_ADMIN)
    private readonly cognitoAdmin: PrivacyCognitoAdmin,
    @Inject(STYNX_PRIVACY_OPTIONS)
    private readonly options: StynxPrivacyModuleOptions,
  ) {}

  async exportData(input: PrivacyExportRequest): Promise<PrivacyExportResult> {
    if (!input.subjectUserId && !input.tenantId) {
      throw new PrivacyValidationError('Export requires subjectUserId or tenantId');
    }

    const rules = await this.piiMapService.load();
    const grouped = groupRules(rules);
    const tables: Array<{ table: string; liveRows: number; archiveRows: number }> = [];
    const snapshots: TableSnapshot[] = [];

    const database = this.database();
    await database.withSystemContext('privacy export bundle generation', async () =>
      database.tx(
        async (trx) => {
          for (const [table, tableRules] of grouped) {
            const liveRows = await this.selectTableRows(trx, tableRules, false, input.subjectUserId, input.tenantId);
            const archiveRows = await this.selectTableRows(trx, tableRules, true, input.subjectUserId, input.tenantId);
            if (liveRows.length === 0 && archiveRows.length === 0) {
              continue;
            }

            tables.push({ table, liveRows: liveRows.length, archiveRows: archiveRows.length });
            snapshots.push({ table: `${table}#live`, rows: liveRows });
            snapshots.push({ table: `${table}#archive`, rows: archiveRows });
          }
        },
        { role: 'owner', readonly: true, replica: false },
      ),
    );

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        subjectUserId: input.subjectUserId ?? null,
        tenantId: input.tenantId ?? null,
        tables,
      }, null, 2),
    );

    for (const snapshot of snapshots) {
      const safeName = snapshot.table.replace(/[^\w.-]/gu, '_');
      zip.file(`tables/${safeName}.json`, JSON.stringify(snapshot.rows, null, 2));

      const columns = [...new Set(snapshot.rows.flatMap((row) => Object.keys(row)))];
      const csvLines = [
        columns.join(','),
        ...snapshot.rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
      ];
      zip.file(`tables/${safeName}.csv`, csvLines.join('\n'));
    }

    const exportId = randomUUID();
    const objectKey = `exports/${exportId}.zip`;
    const expiresInSeconds = this.options.exportTtlSeconds ?? 7 * 24 * 60 * 60;
    await this.objectStore.putObject({
      key: objectKey,
      body: await zip.generateAsync({ type: 'nodebuffer' }),
      contentType: 'application/zip',
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    });

    return {
      exportId,
      objectKey,
      downloadUrl: await this.objectStore.presignDownload({ key: objectKey, expiresInSeconds }),
      expiresInSeconds,
      tables,
    };
  }

  async eraseSubject(input: PrivacyErasureRequest): Promise<PrivacyErasureResult> {
    const rules = await this.piiMapService.load();
    const actions: PrivacyErasureResult['actions'] = [];

    const database = this.database();
    await database.withSystemContext('privacy erasure execution run', async () =>
      database.tx(
        async (trx) => {
          for (const rule of rules) {
            const liveAffected = await this.applyErasureRule(trx, rule, false, input.subjectUserId);
            const archiveAffected = await this.applyErasureRule(trx, rule, true, input.subjectUserId);
            actions.push({
              table: `${rule.tableSchema}.${rule.tableName}`,
              column: rule.columnName,
              strategy: rule.strategy,
              liveAffected,
              archiveAffected,
            });
          }
        },
        { role: 'owner', readonly: false, replica: false },
      ),
    );

    await this.cognitoAdmin.disableUser(input.subjectUserId);

    return {
      subjectUserId: input.subjectUserId,
      actions,
    };
  }

  async applyRetention(dryRun = true): Promise<PrivacyRetentionResult> {
    const rules = await this.piiMapService.load();
    const actions: PrivacyRetentionPlanItem[] = [];
    const candidates = rules.filter((rule) => rule.retention !== undefined);

    const database = this.database();
    await database.withSystemContext('privacy retention enforcement sweep', async () =>
      database.tx(
        async (trx) => {
          for (const rule of candidates) {
            const retention = rule.retention!;
            for (const target of this.targetsFor(rule)) {
              const meta = target === 'archive'
                ? { schema: 'archive', table: `${rule.tableSchema}_${rule.tableName}` }
                : { schema: rule.tableSchema, table: rule.tableName };
              const where = `${quoteIdent(retention.timestampColumn)} < (clock_timestamp() - ($1::text || ' days')::interval)`;
              const countResult = await trx.query<{ total: number }>(
                `select count(*)::int as total from ${quoteIdent(meta.schema)}.${quoteIdent(meta.table)} where ${where}`,
                [String(retention.olderThanDays)],
              );
              const total = countResult.rows[0]?.total ?? 0;
              if (total === 0) {
                continue;
              }

              actions.push({
                table: `${meta.schema}.${meta.table}`,
                target,
                strategy: rule.strategy,
                affectedRows: total,
                reason: retention.reason ?? `retention>${retention.olderThanDays}d`,
              });

              if (dryRun || rule.strategy !== 'delete_row') {
                continue;
              }

              await trx.query(
                `delete from ${quoteIdent(meta.schema)}.${quoteIdent(meta.table)} where ${where}`,
                [String(retention.olderThanDays)],
              );
            }
          }
        },
        { role: 'owner', readonly: false, replica: false },
      ),
    );

    return { dryRun, actions };
  }

  async generateRopa(metadata: RopaMetadata = {}): Promise<string> {
    return generateRopaMarkdown(await this.piiMapService.load(), metadata);
  }

  private async selectTableRows(
    trx: Pick<Transaction, 'query'>,
    rules: PrivacyRule[],
    fromArchive: boolean,
    subjectUserId?: string,
    tenantId?: string,
  ): Promise<Record<string, unknown>[]> {
    const rule = rules[0];
    if (!rule?.subjectColumn) {
      return [];
    }

    const schema = fromArchive ? 'archive' : rule.tableSchema;
    const table = fromArchive ? `${rule.tableSchema}_${rule.tableName}` : rule.tableName;
    const filters: string[] = [];
    const values: unknown[] = [];

    if (subjectUserId) {
      values.push(subjectUserId);
      filters.push(`${quoteIdent(rule.subjectColumn)} = $${values.length}::uuid`);
    }
    if (tenantId && rule.tenantColumn) {
      values.push(tenantId);
      filters.push(`${quoteIdent(rule.tenantColumn)} = $${values.length}::uuid`);
    }

    const where = filters.length > 0 ? `where ${filters.join(' and ')}` : '';
    const result = await trx.query<{ row_json: Record<string, unknown> }>(
      `
        select row_to_json(payload) as row_json
        from (
          select *
          from ${quoteIdent(schema)}.${quoteIdent(table)}
          ${where}
        ) payload
      `,
      values,
    );
    return result.rows.map((row) => row.row_json);
  }

  private async applyErasureRule(
    trx: Pick<Transaction, 'query'>,
    rule: PrivacyRule,
    onArchive: boolean,
    subjectUserId: string,
  ): Promise<number> {
    if (!rule.subjectColumn) {
      throw new PrivacyConfigurationError('PII rule is missing subjectColumn metadata', {
        table: `${rule.tableSchema}.${rule.tableName}`,
        column: rule.columnName,
      });
    }

    const schema = onArchive ? 'archive' : rule.tableSchema;
    const table = onArchive ? `${rule.tableSchema}_${rule.tableName}` : rule.tableName;
    const target = `${quoteIdent(schema)}.${quoteIdent(table)}`;
    const where = `${quoteIdent(rule.subjectColumn)} = $1::uuid`;

    await trx.query(`select set_config('app.erasure_strategy', $1, true)`, [rule.strategy]);

    if (rule.strategy === 'delete_row') {
      const deleted = await trx.query(`delete from ${target} where ${where}`, [subjectUserId]);
      return deleted.rowCount ?? 0;
    }

    const values: unknown[] = [subjectUserId];
    let assignment = `${quoteIdent(rule.columnName)} = null`;
    if (rule.strategy === 'tombstone') {
      values.push(`[erased:${subjectUserId}]`);
      assignment = `${quoteIdent(rule.columnName)} = $2`;
    }
    if (rule.strategy === 'hash_with_salt') {
      values.push(this.hashReplacement(rule, subjectUserId));
      assignment = `${quoteIdent(rule.columnName)} = $2`;
    }

    const setClauses = [assignment];
    if (onArchive) {
      setClauses.push(`${quoteIdent('last_erasure_at')} = clock_timestamp()`);
    }

    const updated = await trx.query(
      `update ${target} set ${setClauses.join(', ')} where ${where}`,
      values,
    );
    return updated.rowCount ?? 0;
  }

  private hashReplacement(rule: PrivacyRule, subjectUserId: string): string {
    return `hash:${Buffer.from(
      `${this.options.erasureSalt}:${rule.tableSchema}.${rule.tableName}.${rule.columnName}:${subjectUserId}`,
      'utf8',
    ).toString('base64url')}`;
  }

  private targetsFor(rule: PrivacyRule): Array<'live' | 'archive'> {
    const target = rule.retention?.target ?? 'both';
    if (target === 'live') {
      return ['live'];
    }
    if (target === 'archive') {
      return ['archive'];
    }
    return ['live', 'archive'];
  }

  private database(): Database {
    return this.moduleRef.get(Database, { strict: false });
  }
}
