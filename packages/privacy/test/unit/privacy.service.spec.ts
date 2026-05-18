import { ModuleRef } from '@nestjs/core';
import { PiiMapService } from '../../src/pii-map.service';
import { PrivacyService } from '../../src/privacy.service';
import type { PrivacyCognitoAdmin, PrivacyObjectStore, PrivacyRule } from '../../src/types';
import type { Mock } from 'vitest';

function createService(
  rules: PrivacyRule[],
  query: Mock,
  options: { exportTtlSeconds?: number } = { exportTtlSeconds: 60 },
) {
  const trx = { query };
  const database = {
    withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
    tx: vi.fn((fn: (input: typeof trx) => unknown) => fn(trx)),
  };
  const moduleRef = {
    get: vi.fn(() => database),
  } as unknown as ModuleRef;
  const piiMapService = {
    load: vi.fn(async () => rules),
  } as unknown as PiiMapService;
  const objectStore: PrivacyObjectStore = {
    putObject: vi.fn(async () => undefined),
    presignDownload: vi.fn(async () => 'memory://export'),
  };
  const cognitoAdmin: PrivacyCognitoAdmin = {
    disableUser: vi.fn(async () => undefined),
  };
  return {
    service: new PrivacyService(
      moduleRef,
      piiMapService,
      objectStore,
      cognitoAdmin,
      {
        environment: 'test',
        region: 'us-east-1',
        erasureSalt: 'unit',
        ...options,
      },
    ),
    database,
    objectStore,
    cognitoAdmin,
  };
}

describe('PrivacyService branch coverage', () => {
  const subjectUserId = '01990000-0000-7000-8000-000000000001';

  it('rejects export requests without a selector', async () => {
    const { service } = createService([], vi.fn());

    await expect(service.exportData({ format: 'json' })).rejects.toThrow('Export requires subjectUserId or tenantId');
  });

  it('exports an empty bundle when rules match no rows', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const { service, objectStore } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
        tenantColumn: 'tenant_id',
      },
    ], query);

    await expect(service.exportData({
      tenantId: '01990000-0000-7000-8000-000000000002',
      format: 'csv',
    })).resolves.toMatchObject({
      downloadUrl: 'memory://export',
      expiresInSeconds: 60,
      tables: [],
    });
    expect(objectStore.putObject).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'application/zip',
      key: expect.stringMatching(/^exports\//u),
    }));
  });

  it('exports live and archive rows using subject and tenant filters', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ row_json: { email: 'ana@example.test', note: 'quoted, "value"' } }],
      })
      .mockResolvedValueOnce({
        rows: [{ row_json: { email: 'old@example.test', note: 'line\nbreak' } }],
      });
    const { service, objectStore } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
        tenantColumn: 'tenant_id',
      },
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'display_name',
        strategy: 'tombstone',
        subjectColumn: 'subject_user_id',
      },
    ], query);

    await expect(service.exportData({
      subjectUserId,
      tenantId: '01990000-0000-7000-8000-000000000002',
      format: 'json',
    })).resolves.toMatchObject({
      downloadUrl: 'memory://export',
      tables: [{ table: 'privacy_fixture.subjects', liveRows: 1, archiveRows: 1 }],
    });
    expect(query.mock.calls[0]?.[0]).toContain('"subject_user_id" = $1::uuid');
    expect(query.mock.calls[0]?.[0]).toContain('"tenant_id" = $2::uuid');
    expect(objectStore.putObject).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.any(Buffer),
    }));
  });

  it('exports unfiltered table snapshots and uses the default export TTL', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ row_json: { plain: 'value', empty: null, nested: { a: 1 } } }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
      },
    ], query, {});

    await expect(service.exportData({
      tenantId: '01990000-0000-7000-8000-000000000002',
      format: 'json',
    })).resolves.toMatchObject({
      expiresInSeconds: 7 * 24 * 60 * 60,
      tables: [{ table: 'privacy_fixture.subjects', liveRows: 1, archiveRows: 0 }],
    });
    expect(query.mock.calls[0]?.[0]).not.toContain('where');
  });

  it('skips export rules that do not describe a subject column', async () => {
    const query = vi.fn();
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
      },
    ], query);

    await expect(service.exportData({
      subjectUserId,
      format: 'json',
    })).resolves.toMatchObject({ tables: [] });
    expect(query).not.toHaveBeenCalled();
  });

  it('fails erasure when a rule lacks subject metadata', async () => {
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
      },
    ], vi.fn());

    await expect(service.eraseSubject({ subjectUserId })).rejects.toThrow('PII rule is missing subjectColumn metadata');
  });

  it('applies every erasure strategy to live and archive targets and disables Cognito user', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('delete from')) {
        return { rows: [], rowCount: 3 };
      }
      if (sql.includes('update')) {
        return { rows: [], rowCount: 2 };
      }
      return { rows: [], rowCount: 0 };
    });
    const { service, cognitoAdmin } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
      },
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'display_name',
        strategy: 'tombstone',
        subjectColumn: 'subject_user_id',
      },
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'external_ref',
        strategy: 'hash_with_salt',
        subjectColumn: 'subject_user_id',
      },
      {
        tableSchema: 'privacy_fixture',
        tableName: 'attachments',
        columnName: 'blob_key',
        strategy: 'delete_row',
        subjectColumn: 'subject_user_id',
      },
    ], query);

    await expect(service.eraseSubject({ subjectUserId })).resolves.toMatchObject({
      subjectUserId,
      actions: expect.arrayContaining([
        expect.objectContaining({ column: 'email', strategy: 'nullify', liveAffected: 2, archiveAffected: 2 }),
        expect.objectContaining({ column: 'display_name', strategy: 'tombstone' }),
        expect.objectContaining({ column: 'external_ref', strategy: 'hash_with_salt' }),
        expect.objectContaining({ column: 'blob_key', strategy: 'delete_row', liveAffected: 3 }),
      ]),
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('"display_name" = $2'), [
      subjectUserId,
      `[erased:${subjectUserId}]`,
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('"external_ref" = $2'), [
      subjectUserId,
      expect.stringMatching(/^hash:/u),
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('"last_erasure_at" = clock_timestamp()'),
      expect.any(Array),
    );
    expect(cognitoAdmin.disableUser).toHaveBeenCalledWith(subjectUserId);
  });

  it('treats missing row counts as zero during erasure', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
      },
      {
        tableSchema: 'privacy_fixture',
        tableName: 'attachments',
        columnName: 'blob_key',
        strategy: 'delete_row',
        subjectColumn: 'subject_user_id',
      },
    ], query);

    await expect(service.eraseSubject({ subjectUserId })).resolves.toMatchObject({
      actions: [
        expect.objectContaining({ column: 'email', liveAffected: 0, archiveAffected: 0 }),
        expect.objectContaining({ column: 'blob_key', liveAffected: 0, archiveAffected: 0 }),
      ],
    });
  });

  it('executes retention delete branches across live and archive targets', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'attachments',
        columnName: 'blob_key',
        strategy: 'delete_row',
        subjectColumn: 'subject_user_id',
        retention: {
          timestampColumn: 'created_at',
          olderThanDays: 30,
          target: 'both',
        },
      },
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
        retention: {
          timestampColumn: 'created_at',
          olderThanDays: 90,
          target: 'live',
          reason: 'live cleanup',
        },
      },
    ], query);

    await expect(service.applyRetention(false)).resolves.toEqual({
      dryRun: false,
      actions: [
        {
          table: 'archive.privacy_fixture_attachments',
          target: 'archive',
          strategy: 'delete_row',
          affectedRows: 2,
          reason: 'retention>30d',
        },
        {
          table: 'privacy_fixture.subjects',
          target: 'live',
          strategy: 'nullify',
          affectedRows: 1,
          reason: 'live cleanup',
        },
      ],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('delete from "archive"."privacy_fixture_attachments"'), ['30']);
  });

  it('keeps dry-run retention from deleting and rejects unsafe identifiers', async () => {
    const dryQuery = vi.fn(async () => ({ rows: [{ total: 1 }] }));
    const dryRun = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'delete_row',
        subjectColumn: 'subject_user_id',
        retention: {
          timestampColumn: 'created_at',
          olderThanDays: 30,
          target: 'archive',
        },
      },
    ], dryQuery);

    await expect(dryRun.service.applyRetention()).resolves.toMatchObject({
      dryRun: true,
      actions: [expect.objectContaining({ target: 'archive', affectedRows: 1 })],
    });
    expect(dryQuery).not.toHaveBeenCalledWith(expect.stringContaining('delete from'), expect.anything());

    const unsafe = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'delete_row',
        subjectColumn: 'subject_user_id',
        retention: {
          timestampColumn: 'created_at;drop',
          olderThanDays: 30,
          target: 'live',
        },
      },
    ], vi.fn());
    await expect(unsafe.service.applyRetention()).rejects.toThrow('Unsafe SQL identifier');
  });

  it('treats empty retention count results as zero and defaults target to both', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'delete_row',
        subjectColumn: 'subject_user_id',
        retention: {
          timestampColumn: 'created_at',
          olderThanDays: 30,
        },
      },
    ], query);

    await expect(service.applyRetention(false)).resolves.toEqual({ dryRun: false, actions: [] });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('renders ROPA markdown from loaded rules', async () => {
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        category: 'contact',
        notes: 'email address',
        subjectColumn: 'subject_user_id',
        retention: {
          timestampColumn: 'created_at',
          olderThanDays: 30,
        },
      },
    ], vi.fn());

    await expect(service.generateRopa({
      controllers: ['STYNX'],
      processors: ['AWS'],
      categories: { contact: 'Contact data' },
    })).resolves.toContain('Controllers: STYNX');
    await expect(service.generateRopa()).resolves.toContain('# STYNX ROPA');
  });
});
