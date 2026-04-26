import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

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

interface PrivacyMapOverrideFile {
  rules: PrivacyRule[];
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
  const parsed = parse(readFileSync(mapPath, 'utf8')) as PrivacyMapOverrideFile;
  return generateRopaMarkdown(parsed.rules ?? []);
}
