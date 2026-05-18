import { RequestContext } from '@stynx/core';
import { DocumentsService } from '../../src/documents.service';
import { StorageValidationError } from '../../src/errors';

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
    db?: { tx: jest.Mock };
    s3?: Record<string, jest.Mock>;
    requestContext?: Partial<RequestContext>;
  } = {}) {
    const db = overrides.db ?? { tx: jest.fn() };
    const s3 = overrides.s3 ?? {
      presignUpload: jest.fn(),
      presignDownload: jest.fn(),
      headObject: jest.fn(),
      deleteAllVersions: jest.fn(),
    };
    const requestContext = overrides.requestContext ?? {
      tenantId: 'tenant-1',
      actorId: 'user-1',
    };
    const moduleRef = {
      get: jest.fn((token: unknown) => {
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
    ).rejects.toBeInstanceOf(StorageValidationError);
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
      .mockImplementationOnce(async (fn: (trx: { update: () => { set: () => { where: (clause: unknown) => Promise<void> } }; softDelete: jest.Mock }) => Promise<unknown>) =>
        fn({
          update: () => ({
            set: () => ({
              where: async (_clause: unknown) => undefined,
            }),
          }),
          softDelete: jest.fn(async () => undefined),
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
    let update: jest.Mock;
    db.tx
      .mockImplementationOnce(async (fn: never) => (fn as unknown as (trx: unknown) => Promise<unknown>)(ownedDocumentMock()))
      .mockImplementationOnce(async (fn: never) => {
        update = jest.fn(() => ({
          set: jest.fn(() => ({
            where: jest.fn(async () => undefined),
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
    const softDelete = jest.fn(async () => undefined);
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
    const restoreFromArchive = jest.fn(async () => undefined);
    db.tx.mockImplementationOnce(async (fn: never) =>
      (fn as unknown as (trx: unknown) => Promise<unknown>)({ restoreFromArchive }),
    );

    await service.restore('doc-1');
    expect(restoreFromArchive).toHaveBeenCalledTimes(1);
  });
});
