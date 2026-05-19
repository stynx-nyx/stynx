import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModuleRef } from '@nestjs/core';
import { StynxObjectStore } from '@stynx/storage';
import { PrivacyConfigurationError, PrivacyValidationError } from '../../src/errors';
import { PiiMapService } from '../../src/pii-map.service';
import { PrivacyObjectStoreService } from '../../src/privacy-object-store.service';
import { generateRopaMarkdown } from '../../src/ropa';

vi.mock('@stynx/storage', () => ({
  StynxObjectStore: vi.fn(),
}));

describe('privacy runtime helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('generates ROPA markdown with defaults and data-flow metadata', () => {
    const markdown = generateRopaMarkdown([
      {
        tableSchema: 'auth',
        tableName: 'users',
        columnName: 'email',
        strategy: 'hash_with_salt',
        category: 'contact',
        subjectColumn: 'id',
        notes: 'primary email',
        retention: {
          timestampColumn: 'created_at',
          olderThanDays: 30,
          target: 'archive',
        },
      },
      {
        tableSchema: 'app',
        tableName: 'events',
        columnName: 'payload',
        strategy: 'nullify',
      },
    ], {
      controllers: ['STYNX'],
      processors: ['AWS'],
      categories: { contact: 'Contact data' },
    });

    expect(markdown).toContain('| auth.users | email | hash_with_salt | Contact data | id | archive 30d via created_at | primary email |');
    expect(markdown).toContain('| app.events | payload | nullify | unspecified | unspecified | none |  |');
    expect(markdown).toContain('Controllers: STYNX');
    expect(markdown).toContain('Processors: AWS');
  });

  it('wraps privacy errors with stable codes and optional context', () => {
    expect(new PrivacyValidationError('bad input', { field: 'email' })).toMatchObject({
      code: 'PRIVACY_VALIDATION_ERROR',
      status: 400,
    });
    expect(new PrivacyConfigurationError('bad config', { table: 'auth.users' })).toMatchObject({
      code: 'PRIVACY_CONFIGURATION_ERROR',
      status: 500,
    });
    expect(new PrivacyConfigurationError('bad config')).toMatchObject({
      code: 'PRIVACY_CONFIGURATION_ERROR',
      status: 500,
    });
    expect(new PrivacyValidationError('bad input')).toMatchObject({
      code: 'PRIVACY_VALIDATION_ERROR',
      status: 400,
    });
  });

  it('loads database PII rules, auth user defaults, overrides, and validates subject metadata', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stynx-privacy-'));
    mkdirSync(join(root, 'app/privacy'), { recursive: true });
    writeFileSync(join(root, 'app/privacy/pii-map.yaml'), [
      'rules:',
      '  - tableSchema: app',
      '    tableName: customers',
      '    columnName: email',
      '    strategy: tombstone',
      '    subjectColumn: person_id',
      '    notes: override',
      '',
    ].join('\n'));

    const trx = {
      query: vi.fn(async () => ({
        rows: [
          {
            table_schema: 'auth',
            table_name: 'users',
            column_name: 'email',
            strategy: 'nullify',
            category: null,
            notes: null,
          },
          {
            table_schema: 'app',
            table_name: 'customers',
            column_name: 'email',
            strategy: 'nullify',
            category: 'contact',
            notes: null,
          },
        ],
      })),
    };
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (input: typeof trx) => unknown) => fn(trx)),
    };
    const service = new PiiMapService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      { environment: 'test', region: 'us-east-1', appRoot: root },
    );

    try {
      await expect(service.load()).resolves.toEqual([
        expect.objectContaining({
          tableSchema: 'app',
          tableName: 'customers',
          columnName: 'email',
          strategy: 'tombstone',
          subjectColumn: 'person_id',
          notes: 'override',
        }),
        expect.objectContaining({
          tableSchema: 'auth',
          tableName: 'users',
          columnName: 'email',
          subjectColumn: 'id',
        }),
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('throws when loaded PII rules still lack subject metadata', async () => {
    const trx = {
      query: vi.fn(async () => ({
        rows: [{
          table_schema: 'app',
          table_name: 'customers',
          column_name: 'email',
          strategy: 'nullify',
          category: null,
          notes: null,
        }],
      })),
    };
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (input: typeof trx) => unknown) => fn(trx)),
    };
    const service = new PiiMapService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      { environment: 'test', region: 'us-east-1', appRoot: '/missing/root' },
    );

    await expect(service.load()).rejects.toBeInstanceOf(PrivacyConfigurationError);
  });

  it('loads override-only PII rules and falls back to the process working directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'stynx-privacy-'));
    mkdirSync(join(root, 'app/privacy'), { recursive: true });
    writeFileSync(join(root, 'app/privacy/pii-map.yaml'), [
      'rules:',
      '  - tableSchema: app',
      '    tableName: customers',
      '    columnName: email',
      '    strategy: nullify',
      '    subjectColumn: person_id',
      '',
    ].join('\n'));
    const query = vi.fn(async () => ({ rows: [] }));
    const database = {
      withSystemContext: vi.fn((_reason: string, fn: () => unknown) => fn()),
      tx: vi.fn((fn: (input: { query: typeof query }) => unknown) => fn({ query })),
    };
    const service = new PiiMapService(
      { get: vi.fn(() => database) } as unknown as ModuleRef,
      { environment: 'test', region: 'us-east-1' },
    );

    try {
      vi.spyOn(process, 'cwd').mockReturnValue(root);
      await expect(service.load()).resolves.toEqual([
        expect.objectContaining({
          tableSchema: 'app',
          tableName: 'customers',
          columnName: 'email',
          subjectColumn: 'person_id',
        }),
      ]);
    } finally {
      vi.restoreAllMocks();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('renders data-flow metadata when controllers or processors are provided alone', () => {
    expect(generateRopaMarkdown([], { controllers: ['STYNX'] }))
      .toContain('Controllers: STYNX');
    expect(generateRopaMarkdown([], { controllers: ['STYNX'] }))
      .not.toContain('Processors:');
    expect(generateRopaMarkdown([], { processors: ['AWS'] }))
      .toContain('Processors: AWS');
    expect(generateRopaMarkdown([], { processors: ['AWS'] }))
      .not.toContain('Controllers:');
  });

  it('delegates privacy object store operations with configured defaults and overrides', async () => {
    const putObject = vi.fn(async () => undefined);
    const presignDownload = vi.fn(async () => 'https://download.example.test');
    vi.mocked(StynxObjectStore).mockImplementation(() => ({
      putObject,
      presignDownload,
    }) as never);

    const service = new PrivacyObjectStoreService({
      environment: 'prod',
      region: 'sa-east-1',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
    });

    await service.putObject({ key: 'exports/1.zip', body: Buffer.from('x'), contentType: 'application/zip' });
    await expect(service.presignDownload({ key: 'exports/1.zip', expiresInSeconds: 60 }))
      .resolves.toBe('https://download.example.test');
    expect(StynxObjectStore).toHaveBeenCalledWith({
      bucketName: 'stynx-privacy-prod',
      region: 'sa-east-1',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
    });
    expect(putObject).toHaveBeenCalledWith(expect.objectContaining({ key: 'exports/1.zip' }));
    expect(presignDownload).toHaveBeenCalledWith({ key: 'exports/1.zip', expiresInSeconds: 60 });

    new PrivacyObjectStoreService({
      environment: 'dev',
      region: 'us-east-1',
      bucketName: 'custom-bucket',
    });
    expect(StynxObjectStore).toHaveBeenLastCalledWith({
      bucketName: 'custom-bucket',
      region: 'us-east-1',
    });
  });
});
