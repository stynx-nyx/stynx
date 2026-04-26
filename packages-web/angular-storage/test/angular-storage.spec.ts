import '@angular/compiler';
import { jest } from '@jest/globals';
import { StynxDocumentUploadComponent } from '../src/document-upload.component';

describe('@stynx-web/angular-storage', () => {
  it('moves through initiating, uploading, and completed states', async () => {
    const seen: string[] = [];
    const component = new StynxDocumentUploadComponent(
      {
        initiate: jest.fn(async () => {
          seen.push('initiating');
          return {
            id: 'doc-1',
            s3Key: 'storage/doc-1',
            upload: {
              method: 'PUT',
              url: 'https://upload.example.test',
              headers: { 'content-type': 'application/pdf' },
              expiresInSeconds: 60,
            },
          };
        }),
        complete: jest.fn(async () => {
          seen.push('completed');
          return { id: 'doc-1', scanStatus: 'completed' as const };
        }),
      } as never,
      {
        push: () => undefined,
      } as never,
      {
        upload: async (_url, _file, _headers, onProgress) => {
          seen.push('uploading');
          onProgress(40);
          onProgress(100);
        },
      },
    );
    component.collection = 'attachments';
    component.allowedMimes = ['application/pdf'];
    component.maxBytes = 2048;

    await component.upload({
      name: 'test.pdf',
      type: 'application/pdf',
      size: 1024,
    } as File);

    expect(seen).toEqual(['initiating', 'uploading', 'completed']);
    expect(component.progress).toBe(100);
    expect(component.status).toBe('completed');
  });
});
