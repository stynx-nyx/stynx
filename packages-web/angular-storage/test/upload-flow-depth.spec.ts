import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { StynxToastService } from '@stynx-web/angular-ui';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentService } from '../src/document.service';
import { StynxDocumentUploadComponent } from '../src/document-upload.component';
import { STYNX_UPLOAD_EXECUTOR } from '../src/tokens';
import type { StynxDocumentUploadCompletedEvent, StynxUploadExecutor } from '../src/types';
import { renderComponent } from './support/test-bed';

const i18n = {
  locale: () => 'en-US',
  translate: (key: string, params: Record<string, unknown> = {}) => `${key}${Object.keys(params).length}`,
};

function makePdf(name = 'evidence.pdf'): File {
  return new File(['pdf'], name, { type: 'application/pdf' });
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular-storage upload flow depth', () => {
  it('initiates uploads with the exact presign shape and forwards signed headers to the executor', async () => {
    const documents = {
      complete: vi.fn(async () => ({ id: 'doc-1', scanStatus: 'completed' as const })),
      initiate: vi.fn(async () => ({
        id: 'doc-1',
        s3Key: 'tenant-1/evidence.pdf',
        upload: {
          expiresInSeconds: 60,
          headers: {
            'content-type': 'application/pdf',
            'x-tenant-id': 'tenant-1',
          },
          method: 'PUT' as const,
          url: 'https://uploads.example.test/doc-1',
        },
      })),
      scanStatus$: vi.fn(),
    };
    const executor: StynxUploadExecutor = {
      upload: vi.fn(async (_url, _file, _headers, onProgress) => {
        onProgress(47);
      }),
    };
    const toast = { push: vi.fn() };
    const fixture = await renderComponent(StynxDocumentUploadComponent, {
      inputs: {
        allowedMimes: ['application/pdf'],
        collection: 'cases',
        maxBytes: 10,
      },
      providers: [
        { provide: DocumentService, useValue: documents },
        { provide: STYNX_UPLOAD_EXECUTOR, useValue: executor },
        { provide: StynxToastService, useValue: toast },
        { provide: StynxI18nService, useValue: i18n },
      ],
    });
    const completed: StynxDocumentUploadCompletedEvent[] = [];
    fixture.componentInstance.completed.subscribe((event) => completed.push(event));
    const file = makePdf();

    await fixture.componentInstance.upload(file);
    fixture.detectChanges();

    expect(documents.initiate).toHaveBeenCalledWith({
      byteSize: 3,
      checksumSha256: 'pending-3',
      collection: 'cases',
      filename: 'evidence.pdf',
      mimeType: 'application/pdf',
    });
    expect(executor.upload).toHaveBeenCalledWith(
      'https://uploads.example.test/doc-1',
      file,
      {
        'content-type': 'application/pdf',
        'x-tenant-id': 'tenant-1',
      },
      expect.any(Function),
    );
    expect(documents.complete).toHaveBeenCalledWith('doc-1');
    expect(fixture.componentInstance.progress).toBe(47);
    expect(fixture.componentInstance.scanStatus).toBe('completed');
    expect(toast.push).toHaveBeenCalledWith('Upload completed', 'success');
    expect(completed).toEqual([{ filename: 'evidence.pdf', id: 'doc-1', scanStatus: 'completed' }]);
    expect(fixture.componentInstance.status).toBe('completed');
  });

  it('blocks invalid file types and oversized files before initiating upload', async () => {
    const documents = {
      complete: vi.fn(),
      initiate: vi.fn(),
    };
    const fixture = await renderComponent(StynxDocumentUploadComponent, {
      inputs: {
        allowedMimes: ['image/png'],
        collection: 'cases',
        maxBytes: 2,
      },
      providers: [
        { provide: DocumentService, useValue: documents },
        { provide: STYNX_UPLOAD_EXECUTOR, useValue: { upload: vi.fn() } },
        { provide: StynxToastService, useValue: { push: vi.fn() } },
        { provide: StynxI18nService, useValue: i18n },
      ],
    });

    await fixture.componentInstance.upload(makePdf('wrong-type.pdf'));
    expect(fixture.componentInstance.status).toBe('errored');
    expect(fixture.componentInstance.errorMessage).toBe('File type application/pdf is not allowed.');

    fixture.componentInstance.allowedMimes = [];
    await fixture.componentInstance.upload(makePdf('too-large.pdf'));
    expect(fixture.componentInstance.status).toBe('errored');
    expect(fixture.componentInstance.errorMessage).toBe('File exceeds the 2 byte limit.');
    expect(documents.initiate).not.toHaveBeenCalled();
  });
});
