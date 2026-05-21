import { planAuditDetach } from '../../src/retention';

// Constants pinned for boundary assertions. Computed once here rather than
// inline so the reader can audit them and so the assertions are precise.
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * MS_PER_DAY;
const FIVE_YEARS_MS = 5 * 365 * MS_PER_DAY;

describe('planAuditDetach', () => {
  describe('happy paths', () => {
    it('detaches standard partitions after 90 days and pins retainHotUntil to partitionStart + 90d', () => {
      // 2025-01 partition: partitionStart=2025-01-01, partitionEnd=2025-02-01.
      // now=2026-04-24; cutoff (standard) = now - 90d = 2026-01-24.
      // partitionEnd 2025-02-01 < cutoff 2026-01-24 → detach (returns plan).
      const partitionStart = Date.UTC(2025, 0, 1); // month - 1 = 0 (correct)
      const expectedRetainHotUntil = new Date(partitionStart + NINETY_DAYS_MS).toISOString();
      const plan = planAuditDetach(
        {
          partitionName: 'log_2025_01',
          month: '2025-01',
          containsLgpdRetentionTags: false,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        'audit',
      );

      expect(plan).toEqual({
        partitionName: 'log_2025_01',
        month: '2025-01',
        retentionClass: 'standard_90d',
        objectKey: 'audit/2025-01.sql.gz',
        retainHotUntil: expectedRetainHotUntil,
      });
    });

    it('detaches expired lgpd partitions and pins retainHotUntil to partitionStart + 5y', () => {
      // 2020-01 partition: cutoff (lgpd) = 2026-04-24 - 5y = 2021-04-24.
      // partitionEnd 2020-02-01 < 2021-04-24 → detach.
      const partitionStart = Date.UTC(2020, 0, 1);
      const expectedRetainHotUntil = new Date(partitionStart + FIVE_YEARS_MS).toISOString();
      const plan = planAuditDetach(
        {
          partitionName: 'log_2020_01',
          month: '2020-01',
          containsLgpdRetentionTags: true,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        'audit',
      );

      expect(plan).toEqual({
        partitionName: 'log_2020_01',
        month: '2020-01',
        retentionClass: 'lgpd_5y',
        objectKey: 'audit/2020-01.sql.gz',
        retainHotUntil: expectedRetainHotUntil,
      });
    });

    it('uses the default keyPrefix of "audit" when no third argument is supplied', () => {
      // Kills the StringLiteral mutation on the keyPrefix default parameter
      // by exercising the default branch with no explicit third arg.
      const plan = planAuditDetach(
        {
          partitionName: 'log_2025_01',
          month: '2025-01',
          containsLgpdRetentionTags: false,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        // intentionally omit keyPrefix → falls back to default 'audit'
      );

      expect(plan).not.toBeNull();
      expect(plan?.objectKey).toBe('audit/2025-01.sql.gz');
    });
  });

  describe('retention windows — boundary discipline', () => {
    it('retains lgpd-tagged partitions for the full 5y window (2022-01 is still within window in 2026-04)', () => {
      // partitionEnd 2022-02-01 vs cutoff 2021-04-24 → retain (returns null).
      // Kills any LGPD arithmetic mutation that produces a smaller cutoff,
      // because under the mutation 2022-02-01 < cutoff and the plan is non-null.
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

    it('retains lgpd-tagged partitions whose partitionEnd straddles the cutoff (2024-01 within 5y of 2026-04-24)', () => {
      // partitionEnd 2024-02-01 vs cutoff 2021-04-24 → retain (null).
      // A 5-years → 5-days-equivalent mutation makes cutoff ≈ now, so
      // partitionEnd < cutoff and plan would become non-null — caught here.
      const plan = planAuditDetach(
        {
          partitionName: 'log_2024_01',
          month: '2024-01',
          containsLgpdRetentionTags: true,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        'audit',
      );

      expect(plan).toBeNull();
    });

    it('retains standard partitions still within the 90d window', () => {
      // partitionEnd 2026-04-01 vs cutoff (now - 90d) 2026-01-24 → retain.
      // partitionEnd > cutoff → returns null.
      const plan = planAuditDetach(
        {
          partitionName: 'log_2026_03',
          month: '2026-03',
          containsLgpdRetentionTags: false,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        'audit',
      );

      expect(plan).toBeNull();
    });

    it('treats partitionEnd === cutoff as still-retained (strict > comparison)', () => {
      // Construct `now` such that partitionEnd 2026-02-01 === cutoff
      // → now - 90d = 2026-02-01 → now = 2026-05-02.
      // Original `partitionEnd > cutoff` is false → plan is non-null (detach).
      // Mutated `partitionEnd >= cutoff` is true → returns null (retain).
      // The behavior we lock in: equal means detach (consistent with the
      // strict-greater-than written in source).
      const partitionEnd = new Date(Date.UTC(2026, 1, 1)); // 2026-02-01
      const now = new Date(partitionEnd.getTime() + NINETY_DAYS_MS);
      const plan = planAuditDetach(
        {
          partitionName: 'log_2026_01',
          month: '2026-01',
          containsLgpdRetentionTags: false,
        },
        now,
        'audit',
      );

      expect(plan).not.toBeNull();
      expect(plan?.retentionClass).toBe('standard_90d');
    });
  });

  describe('partitionStart month arithmetic', () => {
    it('places partitionStart on month 1 → Date.UTC monthIndex 0 (January), not later', () => {
      // The `month - 1` arithmetic must produce a January partition for
      // candidate.month = '2025-01'. retainHotUntil = partitionStart + 90d.
      // For partitionStart=2025-01-01, retainHotUntil = 2025-04-01.
      // A `month + 1` mutation would produce partitionStart=2025-03-01 →
      // retainHotUntil=2025-05-30 — caught by the exact ISO assertion.
      const plan = planAuditDetach(
        {
          partitionName: 'log_2025_01',
          month: '2025-01',
          containsLgpdRetentionTags: false,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        'audit',
      );

      expect(plan?.retainHotUntil).toBe(new Date(Date.UTC(2025, 0, 1) + NINETY_DAYS_MS).toISOString());
    });

    it('places partitionStart on month 12 → Date.UTC monthIndex 11 (December), not roll-over', () => {
      const plan = planAuditDetach(
        {
          partitionName: 'log_2024_12',
          month: '2024-12',
          containsLgpdRetentionTags: false,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        'audit',
      );

      expect(plan?.retainHotUntil).toBe(new Date(Date.UTC(2024, 11, 1) + NINETY_DAYS_MS).toISOString());
    });
  });

  describe('keyPrefix sanitization (trailing slash stripping)', () => {
    it('strips a single trailing slash from keyPrefix', () => {
      const plan = planAuditDetach(
        {
          partitionName: 'log_2020_01',
          month: '2020-01',
          containsLgpdRetentionTags: true,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        'audit/',
      );

      expect(plan?.objectKey).toBe('audit/2020-01.sql.gz');
    });

    it('strips multiple trailing slashes from keyPrefix (regex anchored at $ with + quantifier)', () => {
      // Original /\/+$/ strips ALL trailing slashes → 'audit'.
      // Mutation /\/+/ (no $) strips the first slash run → on 'audit///'
      //                                                    matches the first '///' run → 'audit'.
      //                                                    On 'audit///x/' matches '///' anchor-free → 'auditx/' (different).
      // Mutation /\/$/ strips only ONE trailing slash → 'audit//'.
      // Asserting the exact objectKey with 'audit///' input kills the
      // single-slash-only mutant; the no-anchor mutant is killed by the
      // 'embedded-slashes' test below.
      const plan = planAuditDetach(
        {
          partitionName: 'log_2020_01',
          month: '2020-01',
          containsLgpdRetentionTags: true,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        'audit///',
      );

      expect(plan?.objectKey).toBe('audit/2020-01.sql.gz');
    });

    it('preserves embedded slashes inside keyPrefix and only strips the trailing run', () => {
      // 'archive/audit/' → original /\/+$/ → 'archive/audit'.
      // Mutation /\/+/ (no $) strips the FIRST '/' run → 'archiveaudit/' (different).
      // Mutation /\/$/ strips one trailing slash → 'archive/audit' (same as original).
      // So this test specifically kills the no-anchor mutant.
      const plan = planAuditDetach(
        {
          partitionName: 'log_2020_01',
          month: '2020-01',
          containsLgpdRetentionTags: true,
        },
        new Date('2026-04-24T00:00:00.000Z'),
        'archive/audit/',
      );

      expect(plan?.objectKey).toBe('archive/audit/2020-01.sql.gz');
    });
  });

  describe('input validation', () => {
    it('rejects malformed partition months (NaN year)', () => {
      expect(
        planAuditDetach(
          {
            partitionName: 'log_bad',
            month: 'bad',
            containsLgpdRetentionTags: false,
          },
          new Date('2026-04-24T00:00:00.000Z'),
        ),
      ).toBeNull();
    });

    it('rejects malformed partition months (NaN month component)', () => {
      expect(
        planAuditDetach(
          {
            partitionName: 'log_2025_xx',
            month: '2025-xx',
            containsLgpdRetentionTags: false,
          },
          new Date('2026-04-24T00:00:00.000Z'),
        ),
      ).toBeNull();
    });

    it('rejects partition months with month=0 (Number("0") is falsy in the !month guard)', () => {
      expect(
        planAuditDetach(
          {
            partitionName: 'log_2025_00',
            month: '2025-00',
            containsLgpdRetentionTags: false,
          },
          new Date('2026-04-24T00:00:00.000Z'),
        ),
      ).toBeNull();
    });
  });
});
