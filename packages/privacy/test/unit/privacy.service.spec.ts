import { ModuleRef } from '@nestjs/core';
import { PiiMapService } from '../../src/pii-map.service';
import { PrivacyService } from '../../src/privacy.service';
import type { PrivacyCognitoAdmin, PrivacyObjectStore, PrivacyRule } from '../../src/types';

function createService(rules: PrivacyRule[], query: jest.Mock) {
  const trx = { query };
  const database = {
    withSystemContext: jest.fn((_reason: string, fn: () => unknown) => fn()),
    tx: jest.fn((fn: (input: typeof trx) => unknown) => fn(trx)),
  };
  const moduleRef = {
    get: jest.fn(() => database),
  } as unknown as ModuleRef;
  const piiMapService = {
    load: jest.fn(async () => rules),
  } as unknown as PiiMapService;
  const objectStore: PrivacyObjectStore = {
    putObject: jest.fn(async () => undefined),
    presignDownload: jest.fn(async () => 'memory://export'),
  };
  const cognitoAdmin: PrivacyCognitoAdmin = {
    disableUser: jest.fn(async () => undefined),
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
        exportTtlSeconds: 60,
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
    const { service } = createService([], jest.fn());

    await expect(service.exportData({ format: 'json' })).rejects.toThrow('Export requires subjectUserId or tenantId');
  });

  it('exports an empty bundle when rules match no rows', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
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

  it('skips export rules that do not describe a subject column', async () => {
    const query = jest.fn();
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
    ], jest.fn());

    await expect(service.eraseSubject({ subjectUserId })).rejects.toThrow('PII rule is missing subjectColumn metadata');
  });

  it('executes retention delete branches across live and archive targets', async () => {
    const query = jest
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
    ], jest.fn());

    await expect(service.generateRopa({
      controllers: ['STYNX'],
      processors: ['AWS'],
      categories: { contact: 'Contact data' },
    })).resolves.toContain('Controllers: STYNX');
  });
});
