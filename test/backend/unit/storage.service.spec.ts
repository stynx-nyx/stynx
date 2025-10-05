import { StorageService } from '@core/storage/storage.service';

describe('StorageService', () => {
  it('persists files with tenancy context', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            fileId: 'f1',
            bucket: 'b',
            objectKey: 'key',
            filename: 'file.txt',
            mimeType: 'text/plain',
            ownerId: 'user',
            createdAt: new Date(),
          },
        ],
      }),
    };
    const service = new StorageService(db as any);
    await service.registerFile({
      tenantId: 'tenant',
      ownerId: 'user',
      bucket: 'b',
      objectKey: 'key',
      filename: 'file.txt',
      mimeType: 'text/plain',
    });
    expect(db.query).toHaveBeenCalledWith(expect.any(String), expect.any(Array), {
      tenantId: 'tenant',
      userId: 'user',
    });
  });
});
