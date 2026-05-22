import { RequestContext } from '@stynx/core';
import { DocumentsService } from '../../src/documents.service';
import {
  StorageCollectionNotFoundError,
  StorageDocumentNotFoundError,
  StorageTenantMismatchError,
} from '../../src/errors';
import type { Mock } from 'vitest';

describe('DocumentsService', () => {
  const baseOptions = {
    environment: 'test',
    region: 'us-east-1',
    kmsAlias: 'stynx-docs',
    collections: {
      invoices: {
        mimeAllowlist: ['application/pdf'],
        maxBytes: 1024,
        classificationDefault: 'internal',
      },
    },
  };

  function createService(overrides: {
    db?: { tx: Mock };
    s3?: Record<string, Mock>;
    requestContext?: Partial<RequestContext>;
  } = {}) {
    const db = overrides.db ?? { tx: vi.fn() };
    const s3 = overrides.s3 ?? {
      presignUpload: vi.fn(),
      presignDownload: vi.fn(),
      headObject: vi.fn(),
      deleteAllVersions: vi.fn(),
    };
    const requestContext = overrides.requestContext ?? {
      tenantId: 'tenant-1',
      actorId: 'user-1',
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if ((token as { name?: string })?.name === 'Database') {
          return db;
        }
        return undefined;
      }),
    };
    return {
      service: new DocumentsService(moduleRef as never, requestContext as RequestContext, s3 as never, baseOptions),
      db,
      s3,
    };
  }

  it('initiates a document with a tenant-scoped key and presigned upload', async () => {
    const { service, db, s3 } = createService();
    db.tx.mockImplementation(async (fn: (trx: { insert: () => { values: (value: unknown) => Promise<void> } }) => Promise<void>) =>
      fn({
        insert: () => ({
          values: async () => undefined,
        }),
      }),
    );
    s3.presignUpload.mockResolvedValue({
      method: 'PUT',
      url: 'https://upload.test',
      headers: { 'content-type': 'application/pdf' },
      expiresInSeconds: 300,
    });

    const result = await service.initiate({
      collection: 'invoices',
      filename: '../invoice.pdf',
      mimeType: 'application/pdf',
      byteSize: 512,
      checksumSha256: 'a'.repeat(64),
    });

    expect(result.s3Key).toMatch(/^tenant-1\/invoices\/\d{4}\/\d{2}\/\d{2}\/.+\/1\/invoice\.pdf$/);
    expect(s3.presignUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        key: result.s3Key,
        contentType: 'application/pdf',
      }),
    );
  });

  it('normalizes initiate inputs and persists exact document metadata', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T14:03:04.000Z'));
    const { service, db, s3 } = createService();
    let inserted: Record<string, unknown> | undefined;
    db.tx.mockImplementation(async (fn: (trx: { insert: () => { values: (value: Record<string, unknown>) => Promise<void> } }) => Promise<void>) =>
      fn({
        insert: () => ({
          values: async (value) => {
            inserted = value;
          },
        }),
      }),
    );
    s3.presignUpload.mockResolvedValue({
      method: 'PUT',
      url: 'https://upload.test',
      headers: { 'content-type': 'application/pdf' },
      expiresInSeconds: 300,
    });

    try {
      const result = await service.initiate({
        collection: 'invoices',
        filename: '../unsafe name?.PDF',
        mimeType: ' APPLICATION/PDF ',
        byteSize: 1024,
        checksumSha256: 'A'.repeat(64),
        classification: 'restricted',
      });

      expect(result.s3Key).toMatch(
        /^tenant-1\/invoices\/2026\/05\/21\/.+\/1\/unsafe_name_.PDF$/,
      );
      expect(inserted).toMatchObject({
        tenantId: 'tenant-1',
        collection: 'invoices',
        s3Key: result.s3Key,
        filename: 'unsafe_name_.PDF',
        mimeType: 'application/pdf',
        byteSize: 1024,
        checksumSha256: 'a'.repeat(64),
        scanStatus: 'not_scanned',
        scanDetail: {},
        encryption: 'aws:kms',
        classification: 'restricted',
        ownerUserId: 'user-1',
      });
      expect(s3.presignUpload).toHaveBeenCalledWith({
        key: result.s3Key,
        contentType: 'application/pdf',
        checksumSha256: 'a'.repeat(64),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects collection size overflow', async () => {
    const { service } = createService();
    await expect(
      service.initiate({
        collection: 'invoices',
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
      byteSize: 2048,
      checksumSha256: 'a'.repeat(64),
      }),
    ).rejects.toMatchObject({
      message: 'Document exceeds the collection size limit',
      context: {
        collection: 'invoices',
        byteSize: 2048,
        maxBytes: 1024,
      },
    });
  });

  it('rejects unknown collections, disallowed mime types, bad checksums, and missing context', async () => {
    await expect(createService().service.initiate({
      collection: 'missing',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      byteSize: 1,
      checksumSha256: 'a'.repeat(64),
    })).rejects.toBeInstanceOf(StorageCollectionNotFoundError);

    await expect(createService().service.initiate({
      collection: 'invoices',
      filename: 'invoice.pdf',
      mimeType: 'image/png',
      byteSize: 1,
      checksumSha256: 'a'.repeat(64),
    })).rejects.toMatchObject({
      message: 'MIME type is not allowed for this collection',
      context: { collection: 'invoices', mimeType: 'image/png' },
    });

    await expect(createService().service.initiate({
      collection: 'invoices',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      byteSize: 1,
      checksumSha256: `${'a'.repeat(64)}f`,
    })).rejects.toThrow('checksum_sha256 must be a 64-character hex digest');

    await expect(createService().service.initiate({
      collection: 'invoices',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      byteSize: 1,
      checksumSha256: `f${'a'.repeat(64)}`,
    })).rejects.toThrow('checksum_sha256 must be a 64-character hex digest');

    await expect(createService({ requestContext: { actorId: 'user-1' } }).service.initiate({
      collection: 'invoices',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      byteSize: 1,
      checksumSha256: 'a'.repeat(64),
    })).rejects.toThrow('Tenant context is required');

    await expect(createService({ requestContext: { tenantId: 'tenant-1' } }).service.initiate({
      collection: 'invoices',
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      byteSize: 1,
      checksumSha256: 'a'.repeat(64),
    })).rejects.toThrow('Actor context is required');
  });

  it('quarantines a document when the uploaded metadata does not match', async () => {
    const { service, db, s3 } = createService();
    db.tx
      .mockImplementationOnce(async (fn: (trx: { select: () => { from: () => { where: () => { limit: () => Promise<unknown[]> } } } }) => Promise<unknown>) =>
        fn({
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => [
                  {
                    id: 'doc-1',
                    tenantId: 'tenant-1',
                    collection: 'invoices',
                    s3Key: 'tenant-1/invoices/key',
                    filename: 'invoice.pdf',
                    mimeType: 'application/pdf',
                    byteSize: 32,
                    checksumSha256: 'a'.repeat(64),
                    scanStatus: 'not_scanned',
                    scanDetail: {},
                  },
                ],
              }),
            }),
          }),
        }),
      )
      .mockImplementationOnce(async (fn: (trx: { update: () => { set: () => { where: (clause: unknown) => Promise<void> } }; softDelete: Mock }) => Promise<unknown>) =>
        fn({
          update: () => ({
            set: () => ({
              where: async (_clause: unknown) => undefined,
            }),
          }),
          softDelete: vi.fn(async () => undefined),
        }),
      );
    s3.headObject.mockResolvedValue({
      contentType: 'image/png',
      metadata: { sha256: 'b'.repeat(64) },
    });

    const result = await service.complete('doc-1');
    expect(result.scanStatus).toBe('quarantined');
  });

  function ownedDocumentMock() {
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: 'doc-1',
                tenantId: 'tenant-1',
                collection: 'invoices',
                s3Key: 'tenant-1/invoices/key',
                filename: 'invoice.pdf',
                mimeType: 'application/pdf',
                byteSize: 32,
                checksumSha256: 'a'.repeat(64),
                scanStatus: 'not_scanned',
                scanDetail: {},
              },
            ],
          }),
        }),
      }),
    };
  }

  it('completes scan + persists scanDetail when content + checksum match', async () => {
    const { service, db, s3 } = createService();
    let update: Mock;
    db.tx
      .mockImplementationOnce(async (fn: never) => (fn as unknown as (trx: unknown) => Promise<unknown>)(ownedDocumentMock()))
      .mockImplementationOnce(async (fn: never) => {
        update = vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(async () => undefined),
          })),
        }));
        return (fn as unknown as (trx: unknown) => Promise<unknown>)({ update });
      });
    s3.headObject.mockResolvedValue({
      contentType: 'application/pdf',
      metadata: { sha256: 'a'.repeat(64) },
      contentLength: 32,
    });

    const result = await service.complete('doc-1');
    expect(result.scanStatus).toBe('completed');
  });

  it('uses completion headers when object metadata is absent', async () => {
    const { service, db, s3 } = createService();
    db.tx
      .mockImplementationOnce(async (fn: never) => (fn as unknown as (trx: unknown) => Promise<unknown>)(ownedDocumentMock()))
      .mockImplementationOnce(async (fn: never) =>
        (fn as unknown as (trx: unknown) => Promise<unknown>)({
          update: () => ({ set: () => ({ where: async () => undefined }) }),
        }),
      );
    s3.headObject.mockResolvedValue({});

    await expect(service.complete('doc-1', {
      contentType: 'application/pdf',
      checksumSha256: 'a'.repeat(64),
    })).resolves.toEqual({ id: 'doc-1', scanStatus: 'completed' });
  });

  it('quarantines completion when object metadata and completion headers are absent', async () => {
    const { service, db, s3 } = createService();
    const softDelete = vi.fn(async () => undefined);
    db.tx
      .mockImplementationOnce(async (fn: never) => (fn as unknown as (trx: unknown) => Promise<unknown>)(ownedDocumentMock()))
      .mockImplementationOnce(async (fn: never) =>
        (fn as unknown as (trx: unknown) => Promise<unknown>)({
          update: () => ({ set: () => ({ where: async () => undefined }) }),
          softDelete,
        }),
      );
    s3.headObject.mockResolvedValue({});

    await expect(service.complete('doc-1')).resolves.toEqual({ id: 'doc-1', scanStatus: 'quarantined' });
    expect(softDelete).toHaveBeenCalledTimes(1);
  });

  it('getDownloadUrl returns a signed URL via s3.presignDownload', async () => {
    const { service, db, s3 } = createService();
    db.tx.mockImplementationOnce(async (fn: never) =>
      (fn as unknown as (trx: unknown) => Promise<unknown>)(ownedDocumentMock()),
    );
    s3.presignDownload.mockResolvedValue({ url: 'https://download.test', expiresInSeconds: 60 });

    const result = await service.getDownloadUrl('doc-1');

    expect(result.url).toBe('https://download.test');
    expect(result.expiresInSeconds).toBe(60);
    expect(s3.presignDownload).toHaveBeenCalledWith({
      key: 'tenant-1/invoices/key',
      filename: 'invoice.pdf',
    });
  });

  it('softRemove looks up the owned document + calls trx.softDelete', async () => {
    const { service, db } = createService();
    const softDelete = vi.fn(async () => undefined);
    db.tx
      .mockImplementationOnce(async (fn: never) =>
        (fn as unknown as (trx: unknown) => Promise<unknown>)(ownedDocumentMock()),
      )
      .mockImplementationOnce(async (fn: never) =>
        (fn as unknown as (trx: unknown) => Promise<unknown>)({ softDelete }),
      );

    await service.softRemove('doc-1');
    expect(softDelete).toHaveBeenCalledTimes(1);
  });

  it('restore calls trx.restoreFromArchive without requiring document ownership lookup', async () => {
    const { service, db } = createService();
    const restoreFromArchive = vi.fn(async () => undefined);
    db.tx.mockImplementationOnce(async (fn: never) =>
      (fn as unknown as (trx: unknown) => Promise<unknown>)({ restoreFromArchive }),
    );

    await service.restore('doc-1');
    expect(restoreFromArchive).toHaveBeenCalledTimes(1);
  });

  it('reports missing, cross-tenant, and unavailable database cases', async () => {
    const missing = createService();
    missing.db.tx.mockImplementationOnce(async (fn: never) =>
      (fn as unknown as (trx: unknown) => Promise<unknown>)({
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      }),
    );
    await expect(missing.service.getDownloadUrl('doc-missing')).rejects.toBeInstanceOf(StorageDocumentNotFoundError);

    const crossTenant = createService();
    crossTenant.db.tx.mockImplementationOnce(async (fn: never) =>
      (fn as unknown as (trx: unknown) => Promise<unknown>)({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  id: 'doc-1',
                  tenantId: 'tenant-2',
                  collection: 'invoices',
                  s3Key: 'tenant-2/invoices/key',
                  filename: 'invoice.pdf',
                  mimeType: 'application/pdf',
                  byteSize: 32,
                  checksumSha256: 'a'.repeat(64),
                  scanStatus: 'not_scanned',
                  scanDetail: {},
                },
              ],
            }),
          }),
        }),
      }),
    );
    await expect(crossTenant.service.getDownloadUrl('doc-1')).rejects.toBeInstanceOf(StorageTenantMismatchError);

    const moduleRef = { get: vi.fn(() => undefined) };
    const service = new DocumentsService(
      moduleRef as never,
      { tenantId: 'tenant-1', actorId: 'user-1' } as RequestContext,
      {} as never,
      baseOptions,
    );
    await expect(service.restore('doc-1')).rejects.toThrow('Database provider is unavailable');
  });

  it('hard-deletes archived documents only for the current tenant', async () => {
    const { service, db, s3 } = createService();
    const hardDeleteFromArchive = vi.fn(async () => undefined);
    db.tx.mockImplementationOnce(async (fn: never) =>
      (fn as unknown as (trx: unknown) => Promise<unknown>)({
        query: vi.fn(async () => ({
          rows: [{ archive_id: '12', tenant_id: 'tenant-1', s3_key: 'tenant-1/invoices/key' }],
        })),
        hardDeleteFromArchive,
      }),
    );

    await service.hardRemove('doc-1');
    expect(s3.deleteAllVersions).toHaveBeenCalledWith('tenant-1/invoices/key');
    expect(hardDeleteFromArchive).toHaveBeenCalledWith(12n, expect.objectContaining({
      archiveTable: 'archive.storage_documents',
    }));

    const missing = createService();
    missing.db.tx.mockImplementationOnce(async (fn: never) =>
      (fn as unknown as (trx: unknown) => Promise<unknown>)({
        query: vi.fn(async () => ({ rows: [] })),
      }),
    );
    await expect(missing.service.hardRemove('doc-missing')).rejects.toBeInstanceOf(StorageDocumentNotFoundError);

    const mismatch = createService();
    mismatch.db.tx.mockImplementationOnce(async (fn: never) =>
      (fn as unknown as (trx: unknown) => Promise<unknown>)({
        query: vi.fn(async () => ({
          rows: [{ archive_id: '12', tenant_id: 'tenant-2', s3_key: 'tenant-2/invoices/key' }],
        })),
      }),
    );
    await expect(mismatch.service.hardRemove('doc-1')).rejects.toBeInstanceOf(StorageTenantMismatchError);
  });
});
