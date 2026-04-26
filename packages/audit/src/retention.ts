import type { AuditDetachPlan } from './types';

export interface AuditPartitionCandidate {
  partitionName: string;
  month: string;
  containsLgpdRetentionTags: boolean;
}

export function planAuditDetach(
  candidate: AuditPartitionCandidate,
  now: Date,
  keyPrefix = 'audit',
): AuditDetachPlan | null {
  const [year, month] = candidate.month.split('-').map((value) => Number(value));
  if (!year || !month) {
    return null;
  }

  const partitionStart = new Date(Date.UTC(year, month - 1, 1));
  const partitionEnd = new Date(Date.UTC(year, month, 1));
  const cutoff = candidate.containsLgpdRetentionTags
    ? new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  if (partitionEnd > cutoff) {
    return null;
  }

  return {
    partitionName: candidate.partitionName,
    month: candidate.month,
    objectKey: `${keyPrefix.replace(/\/+$/, '')}/${candidate.month}.sql.gz`,
    retentionClass: candidate.containsLgpdRetentionTags ? 'lgpd_5y' : 'standard_90d',
    retainHotUntil: (
      candidate.containsLgpdRetentionTags
        ? new Date(partitionStart.getTime() + 5 * 365 * 24 * 60 * 60 * 1000)
        : new Date(partitionStart.getTime() + 90 * 24 * 60 * 60 * 1000)
    ).toISOString(),
  };
}
