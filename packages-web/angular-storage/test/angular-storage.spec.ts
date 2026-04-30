import '@angular/compiler';
import { jest } from '@jest/globals';
import { of } from 'rxjs';
import { DocumentService } from '../src/document.service';
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

  it('rejects invalid files and surfaces upload failures', async () => {
    const component = new StynxDocumentUploadComponent(
      {
        initiate: jest.fn(async () => {
          throw new Error('should not initiate invalid files');
        }),
        complete: jest.fn(async () => ({ id: 'doc-1', scanStatus: 'completed' as const })),
      } as never,
      { push: () => undefined } as never,
      {
        upload: jest.fn(async () => undefined),
      },
    );
    component.collection = 'attachments';
    component.allowedMimes = ['application/pdf'];
    component.maxBytes = 10;

    await component.upload({ name: 'image.png', type: 'image/png', size: 5 } as File);
    expect(component.status).toBe('errored');
    expect(component.errorMessage).toContain('not allowed');

    await component.upload({ name: 'large.pdf', type: 'application/pdf', size: 11 } as File);
    expect(component.errorMessage).toContain('byte limit');

    const failing = new StynxDocumentUploadComponent(
      {
        initiate: jest.fn(async () => ({
          id: 'doc-2',
          s3Key: 'storage/doc-2',
          upload: {
            method: 'PUT',
            url: 'https://upload.example.test',
            headers: {},
            expiresInSeconds: 60,
          },
        })),
        complete: jest.fn(async () => ({ id: 'doc-2', scanStatus: 'completed' as const })),
      } as never,
      { push: () => undefined } as never,
      {
        upload: async () => {
          throw new Error('network failed');
        },
      },
    );
    failing.collection = 'attachments';

    await failing.upload({ name: 'test.pdf', type: 'application/pdf', size: 5 } as File);
    expect(failing.status).toBe('errored');
    expect(failing.errorMessage).toBe('network failed');
  });

  it('ignores empty file selection events', async () => {
    const component = new StynxDocumentUploadComponent(
      {
        initiate: jest.fn(async () => {
          throw new Error('not used');
        }),
        complete: jest.fn(async () => ({ id: 'doc-1', scanStatus: 'completed' as const })),
      } as never,
      { push: () => undefined } as never,
      { upload: jest.fn(async () => undefined) },
    );

    await component.onFileSelected({ target: { files: { item: () => null } } } as never);
    expect(component.status).toBe('idle');
  });

  it('calls the document API endpoints with normalized base URLs', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown; options?: unknown }> = [];
    const http = {
      post: (url: string, body: unknown, options?: unknown) => {
        calls.push({ method: 'post', url, body, options });
        return of(url.endsWith('/complete') ? { id: 'doc-1', scanStatus: 'completed' } : { id: 'doc-1' });
      },
      get: (url: string, options?: unknown) => {
        calls.push({ method: 'get', url, options });
        return of(url.endsWith('/download') ? { id: 'doc-1', url: 'https://download.example.test' } : []);
      },
    };
    const service = new DocumentService(http as never, {
      apiBaseUrl: 'https://api.example.test/',
      sessionMode: 'bearer',
    });

    await service.initiate({
      collection: 'records',
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      byteSize: 10,
      checksumSha256: 'abc',
    });
    await service.complete('doc-1');
    await service.getDownloadUrl('doc-1');
    await service.list('records');

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.example.test/documents',
      'https://api.example.test/documents/doc-1/complete',
      'https://api.example.test/documents/doc-1/download',
      'https://api.example.test/documents',
    ]);
  });
});
