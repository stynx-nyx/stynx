import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx/data';
import { parse } from 'yaml';
import { z } from 'zod';
import { PrivacyConfigurationError } from './errors';
import { STYNX_PRIVACY_OPTIONS } from './tokens';
import type { PrivacyMapOverrideFile, PrivacyRule, StynxPrivacyModuleOptions } from './types';

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
  retention: z.object({
    timestampColumn: z.string().regex(identifierPattern),
    olderThanDays: z.number().int().positive(),
    target: z.enum(['live', 'archive', 'both']).optional(),
    reason: z.string().trim().min(1).optional(),
  }).optional(),
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

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
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
    return withoutUndefined({
      ...rule,
      subjectColumn: 'id',
    }) as PrivacyRule;
  }

  return withoutUndefined(rule) as PrivacyRule;
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
    const overrides = this.loadOverrideRules();
    const merged = new Map<string, PrivacyRule>();

    for (const rule of dbRules) {
      merged.set(keyOf(rule), rule);
    }

    for (const override of overrides) {
      const key = keyOf(override);
      const base = merged.get(key);
      merged.set(key, withoutUndefined({
        ...(base ?? {}),
        ...override,
      }) as PrivacyRule);
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
      ));
  }

  async loadDatabaseRules(): Promise<PrivacyRule[]> {
    const database = this.database();
    return database.withSystemContext('privacy pii map bootstrap load', async () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<PiiMapRow>(
            `
              select
                table_schema,
                table_name,
                column_name,
                strategy,
                category,
                notes
              from core.pii_map
            `,
            [],
          );
          return result.rows.map(normalizeDbRule);
        },
        { role: 'owner', readonly: true, replica: false },
      ),
    );
  }

  private loadOverrideRules(): PrivacyRule[] {
    const appRoot = this.options.appRoot ?? process.cwd();
    const overridePath = resolve(appRoot, 'app/privacy/pii-map.yaml');
    if (!existsSync(overridePath)) {
      return [];
    }

    const parsed = parse(readFileSync(overridePath, 'utf8')) as PrivacyMapOverrideFile;
    return overrideSchema.parse(parsed).rules.map((rule) => withoutUndefined(rule) as PrivacyRule);
  }

  private database(): Database {
    return this.moduleRef.get(Database, { strict: false });
  }
}
