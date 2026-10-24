import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { isRecord } from './value-validation.js';

interface PrivacyRule {
  tableSchema: string;
  tableName: string;
  columnName: string;
  strategy: string;
  subjectColumn?: string;
  retention?: {
    timestampColumn: string;
    olderThanDays: number;
    target?: string;
  };
  notes?: string;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isPrivacyRule(value: unknown): value is PrivacyRule {
  return isRecord(value) &&
    typeof value.tableSchema === 'string' &&
    typeof value.tableName === 'string' &&
    typeof value.columnName === 'string' &&
    typeof value.strategy === 'string' &&
    isOptionalString(value.subjectColumn) &&
    isOptionalString(value.notes) &&
    (value.retention === undefined ||
      (isRecord(value.retention) &&
        typeof value.retention.timestampColumn === 'string' &&
        typeof value.retention.olderThanDays === 'number' &&
        isOptionalString(value.retention.target)));
}

function generateRopaMarkdown(rules: PrivacyRule[]): string {
  const lines = [
    '# STYNX ROPA',
    '',
    '| Table | Column | Strategy | Subject Link | Retention | Notes |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const rule of rules) {
    const retention = rule.retention
      ? `${rule.retention.target ?? 'both'} ${rule.retention.olderThanDays}d via ${rule.retention.timestampColumn}`
      : 'none';
    lines.push(
      `| ${rule.tableSchema}.${rule.tableName} | ${rule.columnName} | ${rule.strategy} | ${rule.subjectColumn ?? 'unspecified'} | ${retention} | ${rule.notes ?? ''} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function generateRopaFromApp(appRoot: string): string {
  const mapPath = resolve(appRoot, 'app/privacy/pii-map.yaml');
  if (!existsSync(mapPath)) {
    return generateRopaMarkdown([]);
  }
  const parsed: unknown = parse(readFileSync(mapPath, 'utf8'));
  if (!isRecord(parsed)) throw new Error('Privacy map must be an object');
  const rules: unknown = parsed.rules ?? [];
  if (!Array.isArray(rules) || !rules.every(isPrivacyRule))
    throw new Error('Privacy map contains an invalid rule');
  return generateRopaMarkdown(rules);
}
