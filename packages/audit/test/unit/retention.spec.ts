import { planAuditDetach } from '../../src/retention';

describe('planAuditDetach', () => {
  it('detaches standard partitions after 90 days', () => {
    const plan = planAuditDetach(
      {
        partitionName: 'log_2025_01',
        month: '2025-01',
        containsLgpdRetentionTags: false,
      },
      new Date('2026-04-24T00:00:00.000Z'),
      'audit',
    );

    expect(plan).toMatchObject({
      partitionName: 'log_2025_01',
      month: '2025-01',
      retentionClass: 'standard_90d',
      objectKey: 'audit/2025-01.sql.gz',
    });
  });

  it('retains lgpd-tagged partitions hot for five years', () => {
    const plan = planAuditDetach(
      {
        partitionName: 'log_2022_01',
        month: '2022-01',
        containsLgpdRetentionTags: true,
      },
      new Date('2026-04-24T00:00:00.000Z'),
      'audit',
    );

    expect(plan).toBeNull();
  });

  it('rejects malformed partition months and detaches expired lgpd partitions', () => {
    expect(planAuditDetach(
      {
        partitionName: 'log_bad',
        month: 'bad',
        containsLgpdRetentionTags: false,
      },
      new Date('2026-04-24T00:00:00.000Z'),
    )).toBeNull();

    expect(planAuditDetach(
      {
        partitionName: 'log_2020_01',
        month: '2020-01',
        containsLgpdRetentionTags: true,
      },
      new Date('2026-04-24T00:00:00.000Z'),
      'audit/',
    )).toMatchObject({
      retentionClass: 'lgpd_5y',
      objectKey: 'audit/2020-01.sql.gz',
    });
  });
});
