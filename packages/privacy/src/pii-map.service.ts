import { readPiiRules } from './privacy.repository.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import { parse } from 'yaml';
import { z } from 'zod';
import { PrivacyConfigurationError } from './errors.js';
import { requirePrivacySystemContext, requirePrivacyTenantContext } from './privacy-context.js';
import { STYNX_PRIVACY_OPTIONS } from './tokens.js';
import type { PrivacyRule, StynxPrivacyModuleOptions } from './types.js';

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/u;

const privacyRuleSchema = z.object({
  tableSchema: z.string().regex(identifierPattern),
  tableName: z.string().regex(identifierPattern),
  columnName: z.string().regex(identifierPattern),
  strategy: z.enum(['nullify', 'hash_with_salt', 'tombstone', 'delete_row']),
  category: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
  subjectColumn: z.string().regex(identifierPattern).optional(),
  tenantColumn: z.string().regex(identifierPattern).optional(),
  retention: z
    .object({
      timestampColumn: z.string().regex(identifierPattern),
      olderThanDays: z.number().int().positive(),
      target: z.enum(['live', 'archive', 'both']).optional(),
      reason: z.string().trim().min(1).optional(),
    })
    .optional(),
});

const overrideSchema = z.object({
  rules: z.array(privacyRuleSchema).default([]),
});

interface PiiMapRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  strategy: string;
  category: string | null;
  notes: string | null;
}

function keyOf(rule: Pick<PrivacyRule, 'tableSchema' | 'tableName' | 'columnName'>): string {
  return `${rule.tableSchema}.${rule.tableName}.${rule.columnName}`;
}

function checkedParsedRule(value: Record<string, unknown>): PrivacyRule {
  const result: unknown = Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
  if (!isPrivacyRule(result)) {
    throw new PrivacyConfigurationError('Invalid PII rule representation');
  }
  return result;
}

// The caller supplies a fresh spread snapshot of already typed rules.
// Remove only top-level entries; retained nested objects are never inspected.
function withoutUndefinedMergedRule(value: PrivacyRule): PrivacyRule {
  for (const key of Object.keys(value)) {
    if (Reflect.get(value, key) === undefined) Reflect.deleteProperty(value, key);
  }
  for (const key of Object.getOwnPropertySymbols(value)) {
    Reflect.deleteProperty(value, key);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: Record<string, unknown>, key: string): boolean {
  return !(key in value) || typeof value[key] === 'string';
}

function isPrivacyRule(value: unknown): value is PrivacyRule {
  if (!isRecord(value)) return false;
  if (
    typeof value.tableSchema !== 'string' ||
    typeof value.tableName !== 'string' ||
    typeof value.columnName !== 'string' ||
    (value.strategy !== 'nullify' &&
      value.strategy !== 'hash_with_salt' &&
      value.strategy !== 'tombstone' &&
      value.strategy !== 'delete_row') ||
    !optionalString(value, 'category') ||
    !optionalString(value, 'notes') ||
    !optionalString(value, 'subjectColumn') ||
    !optionalString(value, 'tenantColumn')
  ) return false;
  if (!('retention' in value)) return true;
  const retention = value.retention;
  return isRecord(retention) &&
    typeof retention.timestampColumn === 'string' &&
    typeof retention.olderThanDays === 'number' &&
    (!('target' in retention) ||
      retention.target === 'live' || retention.target === 'archive' || retention.target === 'both') &&
    optionalString(retention, 'reason');
}

function normalizeDbRule(row: PiiMapRow): PrivacyRule {
  const rule = privacyRuleSchema.parse({
    tableSchema: row.table_schema,
    tableName: row.table_name,
    columnName: row.column_name,
    strategy: row.strategy,
    ...(row.category ? { category: row.category } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
  });

  if (rule.tableSchema === 'auth' && rule.tableName === 'users') {
    return checkedParsedRule({
      ...rule,
      subjectColumn: 'id',
    });
  }

  return checkedParsedRule(rule);
}

@Injectable()
export class PiiMapService {
  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(STYNX_PRIVACY_OPTIONS)
    private readonly options: StynxPrivacyModuleOptions,
  ) {}

  async load(): Promise<PrivacyRule[]> {
    const dbRules = await this.loadDatabaseRules();
    return this.mergeRules(dbRules);
  }

  async loadTenant(): Promise<PrivacyRule[]> {
    requirePrivacyTenantContext(this.moduleRef);
    const dbRules = await this.database().txIndependent((trx) => this.queryDatabaseRules(trx), {
      role: 'reader',
      readonly: true,
      replica: false,
      retry: false,
    });
    return this.mergeRules(dbRules);
  }

  private mergeRules(dbRules: PrivacyRule[]): PrivacyRule[] {
    const overrides = this.loadOverrideRules();
    const merged = new Map<string, PrivacyRule>();

    for (const rule of dbRules) {
      merged.set(keyOf(rule), rule);
    }

    for (const override of overrides) {
      const key = keyOf(override);
      const base = merged.get(key);
      merged.set(
        key,
        withoutUndefinedMergedRule({
          ...(base ?? {}),
          ...override,
        }),
      );
    }

    const rules = [...merged.values()];
    for (const rule of rules) {
      if (!rule.subjectColumn) {
        throw new PrivacyConfigurationError('PII rule is missing subjectColumn metadata', {
          table: `${rule.tableSchema}.${rule.tableName}`,
          column: rule.columnName,
        });
      }
    }

    return rules.sort((left, right) =>
      `${left.tableSchema}.${left.tableName}.${left.columnName}`.localeCompare(
        `${right.tableSchema}.${right.tableName}.${right.columnName}`,
      ),
    );
  }

  async loadDatabaseRules(): Promise<PrivacyRule[]> {
    requirePrivacySystemContext(this.moduleRef);
    return this.database().txIndependent((trx) => this.queryDatabaseRules(trx), {
      role: 'owner',
      readonly: true,
      replica: false,
    });
  }

  private async queryDatabaseRules(trx: Pick<Transaction, 'run'>): Promise<PrivacyRule[]> {
    const result = await trx.run(readPiiRules,
      [],
    );
    return result.map(normalizeDbRule);
  }

  private loadOverrideRules(): PrivacyRule[] {
    const appRoot = this.options.appRoot ?? process.cwd();
    const overridePath = resolve(appRoot, 'app/privacy/pii-map.yaml');
    if (!existsSync(overridePath)) {
      return [];
    }

    const parsed: unknown = parse(readFileSync(overridePath, 'utf8'));
    return overrideSchema.parse(parsed).rules.map((rule) => checkedParsedRule(rule));
  }

  private database(): Database {
    return this.moduleRef.get(Database, { strict: false });
  }
}
