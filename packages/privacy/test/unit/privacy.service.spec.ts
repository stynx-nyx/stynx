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
    expect(query).not.toHaveBeenCalledTimes(1);
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

// =============================================================================
// WAVE-05A targeted kills — privacy.service.ts mutation survivors.
//
// Pin csvEscape behaviour indirectly through exportData (the only entry point
// that exercises it), the expiresAt arithmetic, the manifest's ?? null
// LogicalOperator survivors, and the "both sides empty" guard on table inclusion.
// =============================================================================

describe('PrivacyService — exportData CSV escaping (kills csvEscape mutants at src/privacy.service.ts:39-48)', () => {
  const subjectUserId = '01990000-0000-7000-8000-000000000001';

  async function exportAndExtractCsv(
    rows: Record<string, unknown>[],
  ): Promise<{ csv: string; columns: string[] }> {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: rows.map((r) => ({ row_json: r })) })  // live
      .mockResolvedValueOnce({ rows: [] });                                  // archive
    let capturedBuffer: Buffer | undefined;
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
      },
    ], query);
    // Replace objectStore.putObject to capture the zip payload.
    const objectStore = (service as unknown as { objectStore: PrivacyObjectStore }).objectStore;
    objectStore.putObject = vi.fn(async ({ body }) => {
      capturedBuffer = body as Buffer;
    });
    await service.exportData({ subjectUserId });
    // Decode zip → tables/<safeName>.csv contents.
    const JSZipModule = await import('jszip');
    const JSZip = JSZipModule.default ?? JSZipModule;
    const zip = await new JSZip().loadAsync(capturedBuffer!);
    const csvEntry = Object.keys(zip.files).find((k) => k.endsWith('.csv'));
    if (!csvEntry) throw new Error('CSV missing from zip');
    const csv = await zip.file(csvEntry)!.async('string');
    const [header] = csv.split('\n');
    return { csv, columns: header!.split(',') };
  }

  it('passes plain strings through verbatim (no quoting)', async () => {
    const { csv } = await exportAndExtractCsv([{ name: 'ana', city: 'sao paulo' }]);
    // No quotes anywhere — kills the StringLiteral mutation that would add
    // them unconditionally.
    expect(csv).toContain('ana,sao paulo');
    expect(csv).not.toContain('"ana"');
  });

  it('escapes strings containing commas by wrapping in double quotes', async () => {
    const { csv } = await exportAndExtractCsv([{ note: 'foo, bar' }]);
    expect(csv).toContain('"foo, bar"');
  });

  it('escapes strings containing newlines by wrapping in double quotes', async () => {
    const { csv } = await exportAndExtractCsv([{ note: 'line1\nline2' }]);
    expect(csv).toContain('"line1\nline2"');
  });

  it('doubles embedded double-quote characters within a quoted field', async () => {
    // csvEscape's inner .replace(/"/g, '""') is the StringLiteral target.
    const { csv } = await exportAndExtractCsv([{ note: 'she said "hi"' }]);
    expect(csv).toContain('"she said ""hi"""');
  });

  it('emits the literal empty string for null and undefined cell values', async () => {
    // The `value === null || value === undefined` branch returns '' (line 41).
    // Mutation `value === null && value === undefined` is always false → would
    // fall through to JSON.stringify producing 'null'/'undefined'.
    const { csv } = await exportAndExtractCsv([{ a: null, b: undefined, c: 'present' }]);
    const lines = csv.split('\n');
    const dataRow = lines[1] ?? '';
    expect(dataRow).toBe(',,present');
  });

  it('JSON-encodes non-string non-null values and wraps them when they contain commas', async () => {
    const { csv } = await exportAndExtractCsv([{ payload: { a: 1, b: 2 } }]);
    // JSON.stringify({a:1,b:2}) = '{"a":1,"b":2}' which contains ',' →
    // gets wrapped in quotes and inner " doubled.
    expect(csv).toContain('"{""a"":1,""b"":2}"');
  });
});

describe('PrivacyService — manifest null coalescing (kills LogicalOperator survivors at src/privacy.service.ts:109-110)', () => {
  const subjectUserId = '01990000-0000-7000-8000-000000000001';
  const tenantId = '01990000-0000-7000-8000-000000000002';

  async function manifestFromExport(input: { subjectUserId?: string; tenantId?: string }) {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ row_json: { x: 1 } }] })
      .mockResolvedValueOnce({ rows: [] });
    let capturedBuffer: Buffer | undefined;
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
        tenantColumn: 'tenant_id',
      },
    ], query);
    const objectStore = (service as unknown as { objectStore: PrivacyObjectStore }).objectStore;
    objectStore.putObject = vi.fn(async ({ body }) => {
      capturedBuffer = body as Buffer;
    });
    await service.exportData({ format: 'json', ...input });
    const JSZipModule = await import('jszip');
    const JSZip = JSZipModule.default ?? JSZipModule;
    const zip = await new JSZip().loadAsync(capturedBuffer!);
    return JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      subjectUserId: string | null;
      tenantId: string | null;
      tables: unknown[];
    };
  }

  it('coalesces absent subjectUserId to null in manifest.json (not undefined)', async () => {
    const manifest = await manifestFromExport({ tenantId });
    expect(manifest.subjectUserId).toBe(null);
    expect(manifest.tenantId).toBe(tenantId);
  });

  it('coalesces absent tenantId to null in manifest.json (not undefined)', async () => {
    const manifest = await manifestFromExport({ subjectUserId });
    expect(manifest.tenantId).toBe(null);
    expect(manifest.subjectUserId).toBe(subjectUserId);
  });
});

describe('PrivacyService — expiresAt arithmetic (kills ArithmeticOperator survivors at src/privacy.service.ts:134)', () => {
  const subjectUserId = '01990000-0000-7000-8000-000000000001';

  // Tolerance window approach — pinning fake timers around async zip
  // generation tends to hang Vitest's worker. We assert that expiresAt sits
  // within [before+ttl, after+ttl] which:
  //   - kills `Date.now() - expiresInSeconds * 1000` (would land in the past),
  //   - kills `expiresInSeconds / 1000` (would land ~now, far below window),
  //   - kills `expiresInSeconds * 60` / `/ 60` / `* 24` etc. (wrong magnitude).

  it('sets expiresAt to Date.now() + (exportTtlSeconds * 1000)', async () => {
    const ttl = 3600;
    const query = vi.fn(async () => ({ rows: [] }));
    const { service, objectStore } = createService([], query, { exportTtlSeconds: ttl });

    const before = Date.now();
    await service.exportData({ subjectUserId });
    const after = Date.now();
    const expectedMin = before + ttl * 1000;
    const expectedMax = after + ttl * 1000;

    const call = (objectStore.putObject as Mock).mock.calls[0]![0] as { expiresAt: Date };
    const observed = call.expiresAt.getTime();
    expect(observed).toBeGreaterThanOrEqual(expectedMin);
    expect(observed).toBeLessThanOrEqual(expectedMax);
  });

  it('uses the 7-day default when exportTtlSeconds is omitted', async () => {
    const sevenDaysSeconds = 7 * 24 * 60 * 60;
    const query = vi.fn(async () => ({ rows: [] }));
    const { service, objectStore } = createService([], query, {});

    const before = Date.now();
    const result = await service.exportData({ subjectUserId });
    const after = Date.now();
    expect(result.expiresInSeconds).toBe(sevenDaysSeconds);

    const call = (objectStore.putObject as Mock).mock.calls[0]![0] as { expiresAt: Date };
    const observed = call.expiresAt.getTime();
    expect(observed).toBeGreaterThanOrEqual(before + sevenDaysSeconds * 1000);
    expect(observed).toBeLessThanOrEqual(after + sevenDaysSeconds * 1000);
  });
});

describe('PrivacyService — empty-side guard on exportData (kills ConditionalExpression at src/privacy.service.ts:91)', () => {
  const subjectUserId = '01990000-0000-7000-8000-000000000001';

  it('includes a table when only liveRows are present (archive empty)', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ row_json: { id: 'r1' } }] })   // live
      .mockResolvedValueOnce({ rows: [] });                              // archive
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
      },
    ], query);
    const result = await service.exportData({ subjectUserId });
    expect(result.tables).toEqual([{ table: 'privacy_fixture.subjects', liveRows: 1, archiveRows: 0 }]);
  });

  it('includes a table when only archiveRows are present (live empty)', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })                                 // live
      .mockResolvedValueOnce({ rows: [{ row_json: { id: 'r1' } }] });      // archive
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
      },
    ], query);
    const result = await service.exportData({ subjectUserId });
    expect(result.tables).toEqual([{ table: 'privacy_fixture.subjects', liveRows: 0, archiveRows: 1 }]);
  });

  it('skips a table only when BOTH sides are empty', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const { service } = createService([
      {
        tableSchema: 'privacy_fixture',
        tableName: 'subjects',
        columnName: 'email',
        strategy: 'nullify',
        subjectColumn: 'subject_user_id',
      },
    ], query);
    const result = await service.exportData({ subjectUserId });
    expect(result.tables).toEqual([]);
  });
});
