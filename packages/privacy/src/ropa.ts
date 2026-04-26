import type { PrivacyRule } from './types';

export interface RopaMetadata {
  controllers?: string[];
  processors?: string[];
  categories?: Record<string, string>;
}

export function generateRopaMarkdown(
  rules: PrivacyRule[],
  metadata: RopaMetadata = {},
): string {
  const lines = [
    '# STYNX ROPA',
    '',
    '| Table | Column | Strategy | Category | Subject Link | Retention | Notes |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const rule of rules) {
    const category = rule.category ? (metadata.categories?.[rule.category] ?? rule.category) : 'unspecified';
    const subjectLink = rule.subjectColumn ?? 'unspecified';
    const retention = rule.retention
      ? `${rule.retention.target ?? 'both'} ${rule.retention.olderThanDays}d via ${rule.retention.timestampColumn}`
      : 'none';
    lines.push(
      `| ${rule.tableSchema}.${rule.tableName} | ${rule.columnName} | ${rule.strategy} | ${category} | ${subjectLink} | ${retention} | ${rule.notes ?? ''} |`,
    );
  }

  if ((metadata.controllers?.length ?? 0) > 0 || (metadata.processors?.length ?? 0) > 0) {
    lines.push('', '## Data Flow');
    if ((metadata.controllers?.length ?? 0) > 0) {
      lines.push('', `Controllers: ${metadata.controllers?.join(', ')}`);
    }
    if ((metadata.processors?.length ?? 0) > 0) {
      lines.push('', `Processors: ${metadata.processors?.join(', ')}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
