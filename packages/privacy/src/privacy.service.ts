import { expiredSessionPartitions, privacyTenantMembership, setErasureStrategy } from './privacy.repository.js';
import { createHmac, randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, executeConfiguredQuery, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import JSZip from 'jszip';
import { z } from 'zod';
import { requirePrivacySystemContext, requirePrivacyTenantContext } from './privacy-context.js';
import { UnconfiguredPrivacyCognitoAdmin } from './unconfigured-identity.js';
import { PiiMapService } from './pii-map.service.js';
import { generateRopaMarkdown, type RopaMetadata } from './ropa.js';
import { PrivacyConfigurationError, PrivacyValidationError } from './errors.js';
import {
  STYNX_PRIVACY_COGNITO_ADMIN,
  STYNX_PRIVACY_OBJECT_STORE,
  STYNX_PRIVACY_OPTIONS,
} from './tokens.js';
import type {
  PrivacyCognitoAdmin,
  PrivacyErasureRequest,
  PrivacyErasureResult,
  PrivacyExportRequest,
  PrivacyExportResult,
  PrivacyObjectStore,
  PrivacyPartitionRetentionItem,
  PrivacyRetentionPlanItem,
  PrivacyRetentionResult,
  PrivacyRule,
  StynxPrivacyModuleOptions,
} from './types.js';

interface TableSnapshot {
  table: string;
  rows: Record<string, unknown>[];
}

function privacyIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) {
    throw new PrivacyConfigurationError('Unsafe SQL identifier', { value });
  }
  return value;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  let significant = text;
  while (significant && /^[\s\p{Cc}]/u.test(significant)) {
    significant = significant.slice(1);
  }
  if (
    typeof value === 'string' &&
    (text.startsWith('\t') ||
      text.startsWith('\r') ||
      ['=', '+', '-', '@'].includes(significant[0] ?? ''))
  ) {
    text = `'${text}`;
  }
  if (/[",\n\r]/u.test(text)) {
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
  for (const [table, group] of grouped) {
    if (
      new Set(group.map((rule) => rule.subjectColumn)).size !== 1 ||
      new Set(group.map((rule) => rule.tenantColumn)).size !== 1
    ) {
      throw new PrivacyConfigurationError('Conflicting PII table scope metadata', { table });
    }
  }
  return grouped;
}

const exportSchema = z
  .object({
    subjectUserId: z.uuid().optional(),
    tenantId: z.uuid().optional(),
    format: z.enum(['json', 'csv']),
  })
  .strict();
const erasureSchema = z.object({ subjectUserId: z.uuid() }).strict();

function validateInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new PrivacyValidationError('Malformed privacy request');
  return parsed.data;
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
    requirePrivacySystemContext(this.moduleRef);
    return this.exportSnapshot(input);
  }

  async exportTenantData(input: PrivacyExportRequest): Promise<PrivacyExportResult> {
    const { tenantId, actorId } = requirePrivacyTenantContext(this.moduleRef);
    const validated = validateInput(exportSchema, input);
    if (validated.tenantId && validated.tenantId !== tenantId) {
      throw new ForbiddenException('Export tenant differs from the admitted tenant');
    }
    return this.exportSnapshot(
      {
        format: validated.format,
        ...(validated.subjectUserId ? { subjectUserId: validated.subjectUserId } : {}),
        ...(validated.tenantId ? { tenantId: validated.tenantId } : {}),
      },
      tenantId,
      actorId,
    );
  }

  private async exportSnapshot(
    input: PrivacyExportRequest,
    tenantId?: string,
    actorId?: string,
  ): Promise<PrivacyExportResult> {
    if (!input.subjectUserId && !input.tenantId) {
      throw new PrivacyValidationError('Export requires subjectUserId or tenantId');
    }

    const rules = await this.loadRules(tenantId);
    const grouped = groupRules(rules);
    const tables: Array<{ table: string; liveRows: number; archiveRows: number }> = [];
    const snapshots: TableSnapshot[] = [];

    await this.runTransaction(
      async (trx) => {
        if (tenantId && input.subjectUserId)
          await this.requireMember(trx, tenantId, input.subjectUserId);
        for (const [table, tableRules] of grouped) {
          const liveRows = await this.selectTableRows(
            trx,
            tableRules,
            false,
            input.subjectUserId,
            tenantId ?? input.tenantId,
          );
          const archiveRows = await this.selectTableRows(
            trx,
            tableRules,
            true,
            input.subjectUserId,
            tenantId ?? input.tenantId,
          );
          if (liveRows.length === 0 && archiveRows.length === 0) {
            continue;
          }

          tables.push({ table, liveRows: liveRows.length, archiveRows: archiveRows.length });
          snapshots.push({ table: `${table}#live`, rows: liveRows });
          snapshots.push({ table: `${table}#archive`, rows: archiveRows });
        }
      },
      tenantId,
      true,
      actorId,
    );
    this.requireExportAuthority(tenantId, actorId);

    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          subjectUserId: input.subjectUserId ?? null,
          tenantId: tenantId ?? input.tenantId ?? null,
          representations: { json: 'lossless', csv: 'spreadsheet-safe strings' },
          tables,
        },
        null,
        2,
      ),
    );

    for (const snapshot of snapshots) {
      const safeName = snapshot.table.replace(/[^\w.-]/gu, '_');
      zip.file(`tables/${safeName}.json`, JSON.stringify(snapshot.rows, null, 2));

      const columns = [...new Set(snapshot.rows.flatMap((row) => Object.keys(row)))];
      const csvLines = [
        columns.map(csvEscape).join(','),
        ...snapshot.rows.map((row) => columns.map((column) => csvEscape(row[column])).join(',')),
      ];
      zip.file(`tables/${safeName}.csv`, csvLines.join('\n'));
    }

    const exportId = randomUUID();
    const objectKey = tenantId ? `exports/${tenantId}/${exportId}.zip` : `exports/${exportId}.zip`;
    const expiresInSeconds = this.options.exportTtlSeconds ?? 7 * 24 * 60 * 60;
    const body = await zip.generateAsync({ type: 'nodebuffer' });
    this.requireExportAuthority(tenantId, actorId);
    await this.objectStore.putObject({
      key: objectKey,
      body,
      contentType: 'application/zip',
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    });

    this.requireExportAuthority(tenantId, actorId);
    const downloadUrl = await this.objectStore.presignDownload({
      key: objectKey,
      expiresInSeconds,
    });
    this.requireExportAuthority(tenantId, actorId);
    return {
      exportId,
      objectKey,
      downloadUrl,
      expiresInSeconds,
      tables,
    };
  }

  async eraseSubject(input: PrivacyErasureRequest): Promise<PrivacyErasureResult> {
    requirePrivacySystemContext(this.moduleRef);
    if (
      this.cognitoAdmin instanceof UnconfiguredPrivacyCognitoAdmin ||
      typeof this.cognitoAdmin?.disableUser !== 'function'
    ) {
      throw new PrivacyConfigurationError('Global erasure requires a configured identity adapter');
    }
    return this.eraseSnapshot(input);
  }

  async eraseTenantSubject(input: PrivacyErasureRequest): Promise<PrivacyErasureResult> {
    const { tenantId } = requirePrivacyTenantContext(this.moduleRef);
    return this.eraseSnapshot(validateInput(erasureSchema, input), tenantId);
  }

  private async eraseSnapshot(
    input: PrivacyErasureRequest,
    tenantId?: string,
  ): Promise<PrivacyErasureResult> {
    const rules = await this.loadRules(tenantId);
    if (
      rules.some((rule) => rule.strategy === 'hash_with_salt') &&
      !this.options.erasureSalt?.trim()
    ) {
      throw new PrivacyConfigurationError('Erasure hashing requires a nonempty salt');
    }
    const actions: PrivacyErasureResult['actions'] = [];

    await this.runTransaction(
      async (trx) => {
        if (tenantId) await this.requireMember(trx, tenantId, input.subjectUserId);
        for (const rule of rules) {
          const liveAffected = await this.applyErasureRule(
            trx,
            rule,
            false,
            input.subjectUserId,
            tenantId,
          );
          const archiveAffected = await this.applyErasureRule(
            trx,
            rule,
            true,
            input.subjectUserId,
            tenantId,
          );
          actions.push({
            table: `${rule.tableSchema}.${rule.tableName}`,
            column: rule.columnName,
            strategy: rule.strategy,
            liveAffected,
            archiveAffected,
          });
        }
      },
      tenantId,
      false,
    );

    if (!tenantId) await this.cognitoAdmin.disableUser(input.subjectUserId);

    return {
      subjectUserId: input.subjectUserId,
      actions,
    };
  }

  async applyRetention(dryRun = true): Promise<PrivacyRetentionResult> {
    requirePrivacySystemContext(this.moduleRef);
    return this.retentionSnapshot(dryRun);
  }

  async applyTenantRetention(dryRun = true): Promise<PrivacyRetentionResult> {
    const { tenantId } = requirePrivacyTenantContext(this.moduleRef);
    if (typeof dryRun !== 'boolean') throw new PrivacyValidationError('dryRun must be a boolean');
    return this.retentionSnapshot(dryRun, tenantId);
  }

  private async retentionSnapshot(
    dryRun: boolean,
    tenantId?: string,
  ): Promise<PrivacyRetentionResult> {
    const rules = await this.loadRules(tenantId);
    const actions: PrivacyRetentionPlanItem[] = [];
    const partitions: PrivacyPartitionRetentionItem[] = [];
    const candidates = rules.filter((rule) => rule.retention !== undefined);

    await this.runTransaction(
      async (trx) => {
        for (const rule of candidates) {
          const retention = rule.retention!;
          for (const target of this.targetsFor(rule)) {
            const meta =
              target === 'archive'
                ? { schema: 'archive', table: `${rule.tableSchema}_${rule.tableName}` }
                : { schema: rule.tableSchema, table: rule.tableName };
            const bindings = {
              schema: privacyIdentifier(meta.schema), table: privacyIdentifier(meta.table),
              timestampColumn: privacyIdentifier(retention.timestampColumn),
              tenantColumn: tenantId ? privacyIdentifier(rule.tenantColumn!) : null,
            };
            const values: [string] | [string, string] = tenantId
              ? [String(retention.olderThanDays), tenantId]
              : [String(retention.olderThanDays)];
            const countResult = await executeConfiguredQuery(trx, 'privacy.retention-count', bindings, values);
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

            await executeConfiguredQuery(trx, 'privacy.retention-delete', bindings, values);
          }
        }

        // ADR-SESSIONS-0003: session month partitions expire 90 days after the month ends.
        if (tenantId) return;
        const expired = await trx.run(expiredSessionPartitions,
          [dryRun],
        );
        for (const row of expired) {
          partitions.push({
            table: 'auth.sessions',
            partition: row.partition_name,
            monthEnd: row.month_end,
            dropped: row.dropped,
            reason: 'retention>90d after month end',
          });
        }
      },
      tenantId,
      Boolean(tenantId && dryRun),
    );

    return { dryRun, actions, partitions };
  }

  async generateRopa(metadata: RopaMetadata = {}): Promise<string> {
    return generateRopaMarkdown(await this.piiMapService.load(), metadata);
  }

  private async loadRules(tenantId?: string): Promise<PrivacyRule[]> {
    const rules = tenantId
      ? await this.piiMapService.loadTenant()
      : await this.piiMapService.load();
    const groups = groupRules(rules);
    return [...groups.values()].flatMap((group) =>
      tenantId && !group[0]?.tenantColumn ? [] : group,
    );
  }

  private requireExportAuthority(tenantId?: string, actorId?: string): void {
    if (!tenantId) {
      requirePrivacySystemContext(this.moduleRef);
      return;
    }
    const admitted = requirePrivacyTenantContext(this.moduleRef);
    if (admitted.tenantId !== tenantId || admitted.actorId !== actorId) {
      throw new ForbiddenException('Privacy export context changed');
    }
  }

  private async runTransaction<T>(
    callback: (trx: Transaction) => Promise<T>,
    tenantId: string | undefined,
    readonly: boolean,
    actorId?: string,
  ): Promise<T> {
    if (tenantId) {
      const admitted = requirePrivacyTenantContext(this.moduleRef);
      if (admitted.tenantId !== tenantId || (actorId && admitted.actorId !== actorId))
        throw new ForbiddenException('Privacy tenant context changed');
      return this.database().txIndependent(callback, {
        role: readonly ? 'reader' : 'app',
        readonly,
        replica: false,
        retry: false,
        ...(readonly ? {} : { requireActor: true }),
      });
    }
    requirePrivacySystemContext(this.moduleRef);
    return this.database().txIndependent(callback, {
      role: 'owner',
      readonly,
      replica: false,
      retry: false,
    });
  }

  private async requireMember(
    trx: Pick<Transaction, 'run'>,
    tenantId: string,
    subjectUserId: string,
  ): Promise<void> {
    const result = await trx.run(privacyTenantMembership,
      [tenantId, subjectUserId],
    );
    if (result[0]?.allowed !== true)
      throw new ForbiddenException('Subject is not an active member of the admitted tenant');
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
    const subject = subjectUserId ? privacyIdentifier(rule.subjectColumn) : null;
    const tenant = tenantId && rule.tenantColumn ? privacyIdentifier(rule.tenantColumn) : null;
    const values: [] | [string] | [string, string] = subjectUserId
      ? tenantId && tenant ? [subjectUserId, tenantId] : [subjectUserId]
      : tenantId && tenant ? [tenantId] : [];
    const result = await executeConfiguredQuery(trx, 'privacy.export', {
      schema: privacyIdentifier(schema), table: privacyIdentifier(table),
      subjectColumn: subject, tenantColumn: tenant,
    }, values);
    return result.rows.map((row) => row.row_json);
  }

  private async applyErasureRule(
    trx: Pick<Transaction, 'query'>,
    rule: PrivacyRule,
    onArchive: boolean,
    subjectUserId: string,
    tenantId?: string,
  ): Promise<number> {
    if (!rule.subjectColumn) {
      throw new PrivacyConfigurationError('PII rule is missing subjectColumn metadata', {
        table: `${rule.tableSchema}.${rule.tableName}`,
        column: rule.columnName,
      });
    }

    const schema = onArchive ? 'archive' : rule.tableSchema;
    const table = onArchive ? `${rule.tableSchema}_${rule.tableName}` : rule.tableName;
    const bindings = {
      schema: privacyIdentifier(schema), table: privacyIdentifier(table),
      subjectColumn: privacyIdentifier(rule.subjectColumn),
      tenantColumn: tenantId ? privacyIdentifier(rule.tenantColumn!) : null,
    };
    const values: [string] | [string, string] = tenantId ? [subjectUserId, tenantId] : [subjectUserId];

    await executeTypedQuery(trx, setErasureStrategy, [rule.strategy]);

    if (rule.strategy === 'delete_row') {
      const deleted = await executeConfiguredQuery(trx, 'privacy.erasure-delete', bindings, values);
      return deleted.rowCount ?? 0;
    }

    const updateBindings = { ...bindings, column: privacyIdentifier(rule.columnName), onArchive };
    let replacement: string | undefined;
    if (rule.strategy === 'tombstone') replacement = `[erased:${subjectUserId}]`;
    if (rule.strategy === 'hash_with_salt') replacement = this.hashReplacement(rule, subjectUserId, tenantId);
    const updated = replacement === undefined
      ? await executeConfiguredQuery(trx, 'privacy.erasure-null', updateBindings, values)
      : await executeConfiguredQuery(trx, 'privacy.erasure-replace', updateBindings,
        tenantId ? [subjectUserId, tenantId, replacement] : [subjectUserId, replacement]);
    return updated.rowCount ?? 0;
  }

  private hashReplacement(rule: PrivacyRule, subjectUserId: string, tenantId?: string): string {
    return `hash:${createHmac('sha256', this.options.erasureSalt)
      .update(
        JSON.stringify([
          'stynx-privacy-pseudonym-v1',
          rule.tableSchema,
          rule.tableName,
          rule.columnName,
          subjectUserId,
          tenantId ?? null,
        ]),
      )
      .digest('hex')}`;
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
