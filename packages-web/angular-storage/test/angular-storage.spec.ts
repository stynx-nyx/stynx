import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { firstValueFrom, of, throwError, toArray } from 'rxjs';
import { STYNX_ANGULAR_OPTIONS } from '@stynx-web/angular';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { StynxToastService } from '@stynx-web/angular-ui';
import { StynxDocumentDownloadComponent } from '../src/document-download.component';
import { DocumentService } from '../src/document.service';
import { StynxDocumentUploadComponent } from '../src/document-upload.component';
import { MultipartUploadExecutor, provideStynxMultipartUploadExecutor } from '../src/multipart-upload.executor';
import { STYNX_DEFAULT_MULTIPART_UPLOAD_OPTIONS, STYNX_MULTIPART_UPLOAD_OPTIONS, STYNX_UPLOAD_EXECUTOR } from '../src/tokens';
import type { StynxDocumentScanEvent, StynxUploadExecutor } from '../src/types';
import { XhrUploadExecutor } from '../src/xhr-upload.executor';
import { renderComponent } from './support/test-bed';

class FakeXmlHttpRequest {
  static instances: FakeXmlHttpRequest[] = [];
  readonly upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  readonly headers: Record<string, string> = {};
  method = '';
  url = '';
  async = false;
  status = 0;
  body: unknown;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeXmlHttpRequest.instances.push(this);
  }

  open(method: string, url: string, async: boolean): void {
    this.method = method;
    this.url = url;
    this.async = async;
  }

  setRequestHeader(key: string, value: string): void {
    this.headers[key] = value;
  }

  send(body: unknown): void {
    this.body = body;
  }
}

function createUploadComponent(
  documents: Pick<DocumentService, 'initiate' | 'complete'> & Partial<Pick<DocumentService, 'scanStatus$'>>,
  toast: Pick<StynxToastService, 'push'>,
  executor: StynxUploadExecutor,
): StynxDocumentUploadComponent {
  const injector = Injector.create({
    providers: [
      { provide: DocumentService, useValue: documents },
      { provide: STYNX_UPLOAD_EXECUTOR, useValue: executor },
      { provide: StynxToastService, useValue: toast },
    ],
  });
  return runInInjectionContext(injector, () => new StynxDocumentUploadComponent());
}

function createDownloadComponent(
  documents: Pick<DocumentService, 'getSignedUrl'>,
): StynxDocumentDownloadComponent {
  const injector = Injector.create({
    providers: [
      { provide: DocumentService, useValue: documents },
    ],
  });
  return runInInjectionContext(injector, () => new StynxDocumentDownloadComponent());
}

function makeResponse(body: BodyInit, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      ...init?.headers,
    },
    ...init,
  });
}

function createDragEvent(file: File | null = null): DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      dropEffect: 'none',
      files: {
        item: () => file,
      },
    },
  } as never;
}

function createMultipartExecutor(
  options: Partial<typeof STYNX_DEFAULT_MULTIPART_UPLOAD_OPTIONS>,
  delegate?: StynxUploadExecutor,
): MultipartUploadExecutor {
  const providers = [
    {
      provide: STYNX_ANGULAR_OPTIONS,
      useValue: {
        apiBaseUrl: 'https://api.example.test/',
        sessionMode: 'bearer',
      },
    },
    {
      provide: STYNX_MULTIPART_UPLOAD_OPTIONS,
      useValue: {
        ...STYNX_DEFAULT_MULTIPART_UPLOAD_OPTIONS,
        ...options,
      },
    },
    ...(delegate ? [{ provide: XhrUploadExecutor, useValue: delegate }] : []),
  ];
  return runInInjectionContext(
    Injector.create({ providers }),
    () => new MultipartUploadExecutor(),
  );
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe('@stynx-web/angular-storage', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders upload and download components with validation failures in the DOM', async () => {
    const uploadFixture = await renderComponent(StynxDocumentUploadComponent, {
      providers: [
        {
          provide: DocumentService,
          useValue: {
            initiate: vi.fn(),
            complete: vi.fn(),
          },
        },
        { provide: STYNX_UPLOAD_EXECUTOR, useValue: { upload: vi.fn() } },
        { provide: StynxToastService, useValue: { push: vi.fn() } },
        { provide: StynxI18nService, useValue: { locale: () => 'en', translate: (key: string) => key } },
      ],
    });

    uploadFixture.componentRef.setInput('allowedMimes', ['application/pdf']);
    uploadFixture.componentRef.setInput('collection', 'records');
    uploadFixture.detectChanges();
    const uploadHost = uploadFixture.nativeElement as HTMLElement;
    expect(uploadHost.querySelector('[data-testid="document-upload-root"]')?.getAttribute('data-upload-status')).toBe('idle');
    expect(uploadHost.querySelector('[data-testid="document-upload-file-input"]')?.getAttribute('accept')).toBe('application/pdf');

    const downloadFixture = await renderComponent(StynxDocumentDownloadComponent, {
      providers: [
        { provide: DocumentService, useValue: { getSignedUrl: vi.fn() } },
      ],
    });
    expect(downloadFixture.nativeElement.textContent).toContain('Download document');
    await downloadFixture.componentInstance.download();
    downloadFixture.detectChanges();
    const downloadHost = downloadFixture.nativeElement as HTMLElement;
    expect(downloadHost.querySelector('[data-testid="document-download-root"]')?.getAttribute('data-download-status')).toBe('errored');
    expect(downloadHost.textContent).toContain('Document id is required.');
  });

  it('starts storage components with empty optional state and null accept attributes', () => {
    const upload = createUploadComponent(
      {
        initiate: vi.fn(async () => {
          throw new Error('not used');
        }),
        complete: vi.fn(async () => ({ id: 'doc-unused', scanStatus: 'completed' as const })),
      },
      { push: () => undefined } as never,
      { upload: vi.fn(async () => undefined) },
    );
    const download = createDownloadComponent({
      getSignedUrl: vi.fn(async () => ({
        id: 'doc-unused',
        url: 'https://download.example.test/doc-unused',
        expiresInSeconds: 60,
      })),
    } as never);

    expect(upload.collection).toBe('');
    expect(upload.errorMessage).toBe('');
    expect(upload.acceptAttribute).toBe(null);
    upload.allowedMimes = ['application/pdf', 'image/png'];
    expect(upload.acceptAttribute).toBe('application/pdf,image/png');
    expect(download.errorMessage()).toBe('');
    expect(download.buttonLabel).toBe('Download document');
  });

  it('downloads a document through a signed URL and emits progress', async () => {
    const originalFetch = globalThis.fetch;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const clicked: Array<{ href: string; download: string }> = [];
    const createdUrls: string[] = [];
    const revokedUrls: string[] = [];
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(function click(this: HTMLAnchorElement): void {
          clicked.push({ href: this.href, download: this.download });
        });
      }
      return element;
    }) as typeof document.createElement);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: (blob: Blob) => {
        createdUrls.push(`${blob.size}`);
        return 'blob:download-1';
      },
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: (url: string) => revokedUrls.push(url),
    });
    const fetchMock = vi.fn(async () => makeResponse('download-body', {
      headers: {
        'content-length': '13',
        'content-disposition': 'attachment; filename="invoice.pdf"',
        'content-type': 'application/pdf',
      },
    }));
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });
    const progress: unknown[] = [];
    const completed: unknown[] = [];
    const component = createDownloadComponent({
      getSignedUrl: vi.fn(async () => ({
        id: 'doc-1',
        url: 'https://download.example.test/files/doc-1.pdf',
        expiresInSeconds: 60,
      })),
    } as never);
    component.documentId = 'doc-1';
    component.downloadProgress.subscribe((value) => progress.push(value));
    component.downloadComplete.subscribe((value) => completed.push(value));

    try {
      await component.download();
      expect(fetchMock).toHaveBeenCalledWith('https://download.example.test/files/doc-1.pdf');
      expect(progress.at(-1)).toEqual({ loadedBytes: 13, totalBytes: 13, percentage: 100 });
      expect(completed).toEqual([{ id: 'doc-1', filename: 'invoice.pdf', byteSize: 13 }]);
      expect(clicked).toEqual([{ href: 'blob:download-1', download: 'invoice.pdf' }]);
      expect(createdUrls).toEqual(['13']);
      expect(revokedUrls).toEqual(['blob:download-1']);
      expect(component.status()).toBe('completed');
      expect(component.progressValue()).toBe(100);
    } finally {
      createElementSpy.mockRestore();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }
  });

  it('surfaces download validation and network failures', async () => {
    const component = createDownloadComponent({
      getSignedUrl: vi.fn(async () => ({
        id: 'doc-2',
        url: 'https://download.example.test/files/doc-2',
        expiresInSeconds: 60,
      })),
    } as never);

    await component.download();
    expect(component.status()).toBe('errored');
    expect(component.errorMessage()).toBe('Document id is required.');

    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async () => makeResponse('', { status: 503 })),
    });
    component.documentId = 'doc-2';
    try {
      await component.download();
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
    }

    expect(component.status()).toBe('errored');
    expect(component.errorMessage()).toBe('Download failed with status 503');
  });

  it('uses explicit download filenames before encoded headers and URL fallbacks', async () => {
    const originalFetch = globalThis.fetch;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    const downloadedNames: string[] = [];
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(function click(this: HTMLAnchorElement): void {
          downloadedNames.push(this.download);
        });
      }
      return element;
    }) as typeof document.createElement);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:download-name',
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi
        .fn()
        .mockResolvedValueOnce(makeResponse('body', {
          headers: {
            'content-disposition': "attachment; filename*=UTF-8''relat%C3%B3rio.pdf",
            'content-type': 'application/pdf',
          },
        }))
        .mockResolvedValueOnce(makeResponse('body')),
    });

    try {
      const explicit = createDownloadComponent({
        getSignedUrl: vi.fn(async () => ({
          id: 'doc-explicit',
          url: 'https://download.example.test/files/ignored.pdf',
          expiresInSeconds: 60,
        })),
      } as never);
      explicit.documentId = 'doc-explicit';
      explicit.filename = 'chosen.pdf';
      await explicit.download();

      const fallback = createDownloadComponent({
        getSignedUrl: vi.fn(async () => ({
          id: 'doc-url',
          url: 'https://download.example.test/files/fallback%20name.pdf',
          expiresInSeconds: 60,
        })),
      } as never);
      fallback.documentId = 'doc-url';
      await fallback.download();
    } finally {
      createElementSpy.mockRestore();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }

    expect(downloadedNames).toEqual(['chosen.pdf', 'fallback name.pdf']);
  });

  it('falls back from malformed encoded headers and invalid URLs to document ids', async () => {
    const originalFetch = globalThis.fetch;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    const downloadedNames: string[] = [];
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(function click(this: HTMLAnchorElement): void {
          downloadedNames.push(this.download);
        });
      }
      return element;
    }) as typeof document.createElement);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:download-name',
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi
        .fn()
        .mockResolvedValueOnce(makeResponse('body', {
          headers: {
            'content-disposition': "attachment; filename*=UTF-8''bad%ZZname.pdf",
          },
        }))
        .mockResolvedValueOnce(makeResponse('body')),
    });

    try {
      const malformedHeader = createDownloadComponent({
        getSignedUrl: vi.fn(async () => ({
          id: 'doc-malformed',
          url: 'https://download.example.test/files/header.pdf',
          expiresInSeconds: 60,
        })),
      } as never);
      malformedHeader.documentId = 'doc-malformed';
      await malformedHeader.download();

      const invalidUrl = createDownloadComponent({
        getSignedUrl: vi.fn(async () => ({
          id: 'doc-invalid-url',
          url: 'not a valid url',
          expiresInSeconds: 60,
        })),
      } as never);
      invalidUrl.documentId = 'doc-invalid-url';
      await invalidUrl.download();
    } finally {
      createElementSpy.mockRestore();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }

    expect(downloadedNames).toEqual(['bad%ZZname.pdf', 'document-doc-invalid-url']);
  });

  it('resolves encoded, plain, and id fallback download names', async () => {
    const originalFetch = globalThis.fetch;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    const downloadedNames: string[] = [];
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(function click(this: HTMLAnchorElement): void {
          downloadedNames.push(this.download);
        });
      }
      return element;
    }) as typeof document.createElement);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:download-name',
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi
        .fn()
        .mockResolvedValueOnce(makeResponse('body', {
          headers: {
            'content-disposition': "attachment; filename*=UTF-8''report%20final.pdf",
          },
        }))
        .mockResolvedValueOnce(makeResponse('body', {
          headers: {
            'content-disposition': 'attachment; filename=plain.pdf',
          },
        }))
        .mockResolvedValueOnce(makeResponse('body')),
    });

    try {
      for (const id of ['encoded', 'plain', 'empty-url']) {
        const component = createDownloadComponent({
          getSignedUrl: vi.fn(async () => ({
            id,
            url: id === 'empty-url' ? 'https://download.example.test/' : `https://download.example.test/files/${id}`,
            expiresInSeconds: 60,
          })),
        } as never);
        component.documentId = ` ${id} `;
        await component.download();
      }
    } finally {
      createElementSpy.mockRestore();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }

    expect(downloadedNames).toEqual(['report final.pdf', 'plain.pdf', 'document-empty-url']);
  });

  it('tracks download busy labels and bodyless browser fallbacks', async () => {
    const component = createDownloadComponent({
      getSignedUrl: vi.fn(async () => ({
        id: 'doc-bodyless',
        url: 'https://download.example.test/bodyless',
        expiresInSeconds: 60,
      })),
    } as never);
    const progress: unknown[] = [];
    component.downloadProgress.subscribe((value) => progress.push(value));
    component.status.set('resolving');
    expect(component.isBusy()).toBe(true);
    expect(component.statusLabel()).toBe('Preparing download');
    component.status.set('downloading');
    expect(component.isBusy()).toBe(true);
    expect(component.statusLabel()).toBe('Downloading document');
    component.status.set('idle');
    expect(component.isBusy()).toBe(false);

    const originalFetch = globalThis.fetch;
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'a') {
        vi.spyOn(element as HTMLAnchorElement, 'click').mockImplementation(() => undefined);
      }
      return element;
    }) as typeof document.createElement);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: () => 'blob:bodyless',
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async () => ({
        ok: true,
        status: 200,
        body: null,
        headers: new Headers({ 'content-length': '0' }),
        blob: async () => new Blob(['fallback']),
      })),
    });

    try {
      component.documentId = 'doc-bodyless';
      await component.download();
    } finally {
      vi.restoreAllMocks();
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      });
    }

    expect(progress.at(-1)).toEqual({ loadedBytes: 8, totalBytes: 8, percentage: 100 });
  });

  it('computes streamed download progress and blob metadata from chunked bodies', async () => {
    const component = createDownloadComponent({
      getSignedUrl: vi.fn(async () => ({
        id: 'doc-progress',
        url: 'https://download.example.test/doc-progress',
        expiresInSeconds: 60,
      })),
    } as never);
    const progress: unknown[] = [];
    component.downloadProgress.subscribe((value) => progress.push(value));

    (component as unknown as {
      emitProgress(loadedBytes: number, totalBytes: number | null): void;
    }).emitProgress(0, 0);
    (component as unknown as {
      emitProgress(loadedBytes: number, totalBytes: number | null): void;
    }).emitProgress(5, 10);
    (component as unknown as {
      emitProgress(loadedBytes: number, totalBytes: number | null): void;
    }).emitProgress(20, 10);

    expect(progress).toEqual([
      { loadedBytes: 0, totalBytes: 0, percentage: 0 },
      { loadedBytes: 5, totalBytes: 10, percentage: 50 },
      { loadedBytes: 20, totalBytes: 10, percentage: 100 },
    ]);
    expect(component.progressValue()).toBe(100);
  });

  it('handles download filename, progress, and browser availability edge cases exactly', async () => {
    const originalFetch = globalThis.fetch;
    const originalDocument = globalThis.document;
    const originalUrl = globalThis.URL;
    const component = createDownloadComponent({
      getSignedUrl: vi.fn(async () => ({
        id: 'doc-edge',
        url: 'not a url',
        expiresInSeconds: 60,
      })),
    } as never);

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: undefined,
    });
    component.documentId = 'doc-edge';
    try {
      await component.download();
      expect(component.status()).toBe('errored');
      expect(component.errorMessage()).toBe('Download is not available in this browser.');

      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: vi.fn(async () => makeResponse('edge-body')),
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: undefined,
      });
      await component.download();
      expect(component.status()).toBe('errored');
      expect(component.errorMessage()).toBe('Download is not available in this browser.');

      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
      Object.defineProperty(globalThis, 'URL', {
        configurable: true,
        value: undefined,
      });
      await component.download();
      expect(component.status()).toBe('errored');
      expect(component.errorMessage()).toBe('Download is not available in this browser.');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      });
      Object.defineProperty(globalThis, 'URL', {
        configurable: true,
        value: originalUrl,
      });
    }
  });

  it('moves through initiating, uploading, and completed states', async () => {
    const seen: string[] = [];
    const component = createUploadComponent(
      {
        initiate: vi.fn(async () => {
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
        complete: vi.fn(async () => {
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
    expect((component as unknown as { documents: { initiate: ReturnType<typeof vi.fn> } }).documents.initiate).toHaveBeenCalledWith({
      collection: 'attachments',
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
      checksumSha256: 'pending-1024',
    });
    expect(component.progress).toBe(100);
    expect(component.status).toBe('completed');

    component.status = 'initiating';
    expect(component.statusLabel).toBe('Preparing upload');
    component.status = 'uploading';
    expect(component.statusLabel).toBe('Uploading file');
  });

  it('handles selected files, quarantine completion, and generic failures', async () => {
    const toasts: unknown[] = [];
    const completed: unknown[] = [];
    const component = createUploadComponent(
      {
        initiate: vi.fn(async () => ({
          id: 'doc-3',
          s3Key: 'storage/doc-3',
          upload: {
            method: 'PUT' as const,
            url: 'https://upload.example.test',
            headers: {},
            expiresInSeconds: 60,
          },
        })),
        complete: vi.fn(async () => ({ id: 'doc-3', scanStatus: 'quarantined' as const })),
      } as never,
      {
        push: (...args: unknown[]) => toasts.push(args),
      } as never,
      {
        upload: vi.fn(async (_url, _file, _headers, onProgress) => onProgress(55)),
      },
    );
    component.collection = 'attachments';
    component.completed.subscribe((value) => completed.push(value));

    await component.onFileSelected({
      target: {
        files: {
          item: () => ({ name: 'note.txt', type: 'text/plain', size: 5 }),
        },
      },
    } as never);

    expect(component.status).toBe('completed');
    expect(component.progress).toBe(55);
    expect(toasts).toEqual([['Upload completed', 'warning']]);
    expect(completed).toEqual([{ id: 'doc-3', filename: 'note.txt', scanStatus: 'quarantined' }]);

    const failing = createUploadComponent(
      {
        initiate: vi.fn(async () => ({
          id: 'doc-4',
          s3Key: 'storage/doc-4',
          upload: { method: 'PUT', url: 'https://upload.example.test', headers: {}, expiresInSeconds: 60 },
        })),
        complete: vi.fn(async () => ({ id: 'doc-4', scanStatus: 'completed' as const })),
      } as never,
      { push: () => undefined } as never,
      {
        upload: async () => {
          throw 'offline';
        },
      },
    );

    await failing.upload({ name: 'test.txt', type: 'text/plain', size: 5 } as File);
    expect(failing.status).toBe('errored');
    expect(failing.errorMessage).toBe('Upload failed');
  });

  it('uploads dropped files when drag-and-drop is enabled', async () => {
    const uploaded: string[] = [];
    const file = new File(['dropped'], 'dropped.pdf', { type: 'application/pdf' });
    const component = createUploadComponent(
      {
        initiate: vi.fn(async () => ({
          id: 'doc-drop',
          s3Key: 'storage/doc-drop',
          upload: {
            method: 'PUT' as const,
            url: 'https://upload.example.test',
            headers: {},
            expiresInSeconds: 60,
          },
        })),
        complete: vi.fn(async () => ({ id: 'doc-drop', scanStatus: 'completed' as const })),
      },
      { push: () => undefined } as never,
      {
        upload: vi.fn(async (_url, droppedFile, _headers, onProgress) => {
          uploaded.push(droppedFile.name);
          onProgress(100);
        }),
      },
    );
    component.collection = 'attachments';
    component.allowedMimes = ['application/pdf'];
    component.enableDragAndDrop = true;

    const dragEvent = createDragEvent(file);
    component.onDragOver(dragEvent);
    expect(dragEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(dragEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(dragEvent.dataTransfer?.dropEffect).toBe('copy');
    expect(component.isDragActive).toBe(true);

    await component.onDrop(createDragEvent(file));

    expect(component.isDragActive).toBe(false);
    expect(uploaded).toEqual(['dropped.pdf']);
    expect(component.status).toBe('completed');
    expect(component.progress).toBe(100);
  });

  it('ignores drag events while drag-and-drop is disabled', async () => {
    const component = createUploadComponent(
      {
        initiate: vi.fn(async () => {
          throw new Error('drop should not upload while disabled');
        }),
        complete: vi.fn(async () => ({ id: 'doc-drop', scanStatus: 'completed' as const })),
      },
      { push: () => undefined } as never,
      { upload: vi.fn(async () => undefined) },
    );
    const event = createDragEvent(new File(['dropped'], 'dropped.pdf', { type: 'application/pdf' }));

    component.onDragOver(event);
    await component.onDrop(event);

    expect(event.preventDefault).not.toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).not.toHaveBeenCalledTimes(1);
    expect(component.isDragActive).toBe(false);
    expect(component.status).toBe('idle');
  });

  it('clears active drag state when leaving an enabled drop zone', () => {
    const component = createUploadComponent(
      {
        initiate: vi.fn(async () => {
          throw new Error('not used');
        }),
        complete: vi.fn(async () => ({ id: 'doc-drop', scanStatus: 'completed' as const })),
      },
      { push: () => undefined } as never,
      { upload: vi.fn(async () => undefined) },
    );
    const event = createDragEvent();
    component.enableDragAndDrop = true;
    component.isDragActive = true;

    component.onDragLeave(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(component.isDragActive).toBe(false);

    const disabledEvent = createDragEvent();
    component.enableDragAndDrop = false;
    component.onDragLeave(disabledEvent);
    expect(disabledEvent.preventDefault).not.toHaveBeenCalled();
    expect(disabledEvent.stopPropagation).not.toHaveBeenCalled();
  });

  it('emits scan-status updates after an upload completes with a pending scan', async () => {
    const toasts: unknown[] = [];
    const scanEvents: StynxDocumentScanEvent[] = [
      { id: 'doc-scan', status: 'pending' },
      { id: 'doc-scan', status: 'scanning', message: 'queued' },
      { id: 'doc-scan', status: 'completed' },
    ];
    const observed: StynxDocumentScanEvent[] = [];
    const completed: unknown[] = [];
    const documents = {
      initiate: vi.fn(async () => ({
        id: 'doc-scan',
        s3Key: 'storage/doc-scan',
        upload: {
          method: 'PUT' as const,
          url: 'https://upload.example.test',
          headers: {},
          expiresInSeconds: 60,
        },
      })),
      complete: vi.fn(async () => ({ id: 'doc-scan', scanStatus: 'pending' as const })),
      scanStatus$: vi.fn(() => of(...scanEvents)),
    };
    const component = createUploadComponent(
      documents,
      {
        push: (...args: unknown[]) => toasts.push(args),
      } as never,
      {
        upload: vi.fn(async (_url, _file, _headers, onProgress) => onProgress(100)),
      },
    );
    component.collection = 'attachments';
    component.scanStatusChanged.subscribe((event) => observed.push(event));
    component.completed.subscribe((event) => completed.push(event));

    await component.upload(new File(['body'], 'scan.pdf', { type: 'application/pdf' }));

    expect(documents.scanStatus$).toHaveBeenCalledWith('doc-scan');
    expect(observed).toEqual([
      { id: 'doc-scan', status: 'pending' },
      { id: 'doc-scan', status: 'scanning', message: 'queued' },
      { id: 'doc-scan', status: 'completed' },
    ]);
    expect(completed).toEqual([{ id: 'doc-scan', filename: 'scan.pdf', scanStatus: 'pending' }]);
    expect(component.scanStatus).toBe('completed');
    expect(toasts).toEqual([['Upload completed', 'success']]);
  });

  it('treats failed scan states as terminal warning completions', async () => {
    const toasts: unknown[] = [];
    const observed: StynxDocumentScanEvent[] = [];
    const component = createUploadComponent(
      {
        initiate: vi.fn(async () => ({
          id: 'doc-failed-scan',
          s3Key: 'storage/doc-failed-scan',
          upload: { method: 'PUT' as const, url: 'https://upload.example.test', headers: {}, expiresInSeconds: 60 },
        })),
        complete: vi.fn(async () => ({ id: 'doc-failed-scan', scanStatus: 'failed' as const })),
        scanStatus$: vi.fn(() => {
          throw new Error('should not watch terminal failed scans');
        }),
      },
      { push: (...args: unknown[]) => toasts.push(args) } as never,
      { upload: vi.fn(async (_url, _file, _headers, onProgress) => onProgress(100)) },
    );
    component.collection = 'attachments';
    component.scanStatusChanged.subscribe((event) => observed.push(event));

    await component.upload(new File(['body'], 'failed.pdf', { type: 'application/pdf' }));

    expect(component.status).toBe('completed');
    expect(component.scanStatus).toBe('failed');
    expect(observed).toEqual([{ id: 'doc-failed-scan', status: 'failed' }]);
    expect(toasts).toEqual([['Upload completed', 'warning']]);
  });

  it('rejects invalid files and surfaces upload failures', async () => {
    const component = createUploadComponent(
      {
        initiate: vi.fn(async () => {
          throw new Error('should not initiate invalid files');
        }),
        complete: vi.fn(async () => ({ id: 'doc-1', scanStatus: 'completed' as const })),
      } as never,
      { push: () => undefined } as never,
      {
        upload: vi.fn(async () => undefined),
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

    const failing = createUploadComponent(
      {
        initiate: vi.fn(async () => ({
          id: 'doc-2',
          s3Key: 'storage/doc-2',
          upload: {
            method: 'PUT',
            url: 'https://upload.example.test',
            headers: {},
            expiresInSeconds: 60,
          },
        })),
        complete: vi.fn(async () => ({ id: 'doc-2', scanStatus: 'completed' as const })),
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

  it('accepts files exactly at the configured byte limit', async () => {
    const component = createUploadComponent(
      {
        initiate: vi.fn(async () => ({
          id: 'doc-limit',
          s3Key: 'storage/doc-limit',
          upload: {
            method: 'PUT' as const,
            url: 'https://upload.example.test',
            headers: {},
            expiresInSeconds: 60,
          },
        })),
        complete: vi.fn(async () => ({ id: 'doc-limit', scanStatus: 'completed' as const })),
      },
      { push: () => undefined } as never,
      {
        upload: vi.fn(async (_url, _file, _headers, onProgress) => onProgress(100)),
      },
    );
    component.collection = 'attachments';
    component.maxBytes = 10;

    await component.upload(new File(['1234567890'], 'limit.txt', { type: 'text/plain' }));

    expect(component.status).toBe('completed');
    expect(component.errorMessage).toBe('');
  });

  it('ignores empty file selection events', async () => {
    const component = createUploadComponent(
      {
        initiate: vi.fn(async () => {
          throw new Error('not used');
        }),
        complete: vi.fn(async () => ({ id: 'doc-1', scanStatus: 'completed' as const })),
      } as never,
      { push: () => undefined } as never,
      { upload: vi.fn(async () => undefined) },
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
    const service = runInInjectionContext(
      Injector.create({
        providers: [
          { provide: HttpClient, useValue: http },
          {
            provide: STYNX_ANGULAR_OPTIONS,
            useValue: {
              apiBaseUrl: 'https://api.example.test/',
              sessionMode: 'bearer',
            },
          },
        ],
      }),
      () => new DocumentService(),
    );

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
    expect(calls.at(-1)?.options).toEqual({ params: { collection: 'records' } });
  });

  it('normalizes repeated API slashes and fills blank scan event ids', async () => {
    const responses: StynxDocumentScanEvent[] = [
      { id: '', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z', message: 'queued' },
      { id: '', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z', message: 'still queued' },
      { id: '', status: 'quarantined', checkedAt: '2026-05-19T06:40:01.000Z' },
    ];
    const calls: string[] = [];
    const service = runInInjectionContext(
      Injector.create({
        providers: [
          {
            provide: HttpClient,
            useValue: {
              get: vi.fn((url: string) => {
                calls.push(url);
                return of(responses.shift() ?? { id: '', status: 'quarantined' as const });
              }),
            },
          },
          {
            provide: STYNX_ANGULAR_OPTIONS,
            useValue: {
              apiBaseUrl: 'https://api.example.test///',
              sessionMode: 'bearer',
            },
          },
        ],
      }),
      () => new DocumentService(),
    );

    const events = await firstValueFrom(service.scanStatus$('doc/fallback', { pollIntervalMs: 0 }).pipe(toArray()));

    expect(events).toEqual([
      { id: 'doc/fallback', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z', message: 'queued' },
      { id: 'doc/fallback', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z', message: 'still queued' },
      { id: 'doc/fallback', status: 'quarantined', checkedAt: '2026-05-19T06:40:01.000Z' },
    ]);
    expect(calls).toEqual([
      'https://api.example.test/storage/documents/doc%2Ffallback/scan-status',
      'https://api.example.test/storage/documents/doc%2Ffallback/scan-status',
      'https://api.example.test/storage/documents/doc%2Ffallback/scan-status',
    ]);
  });

  it('long-polls scan status until a terminal status is returned', async () => {
    const calls: string[] = [];
    const responses: StynxDocumentScanEvent[] = [
      { id: 'doc/scan', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z' },
      { id: 'doc/scan', status: 'scanning', checkedAt: '2026-05-19T06:40:01.000Z' },
      { id: 'doc/scan', status: 'completed', checkedAt: '2026-05-19T06:40:02.000Z' },
    ];
    const http = {
      get: (url: string) => {
        calls.push(url);
        return of(responses.shift() ?? { id: 'doc/scan', status: 'completed' as const });
      },
    };
    const service = runInInjectionContext(
      Injector.create({
        providers: [
          { provide: HttpClient, useValue: http },
          {
            provide: STYNX_ANGULAR_OPTIONS,
            useValue: {
              apiBaseUrl: 'https://api.example.test/',
              sessionMode: 'bearer',
            },
          },
        ],
      }),
      () => new DocumentService(),
    );

    const events = await firstValueFrom(service.scanStatus$('doc/scan', { pollIntervalMs: 1 }).pipe(toArray()));

    expect(events.map((event) => event.status)).toEqual(['pending', 'scanning', 'completed']);
    expect(calls).toEqual([
      'https://api.example.test/storage/documents/doc%2Fscan/scan-status',
      'https://api.example.test/storage/documents/doc%2Fscan/scan-status',
      'https://api.example.test/storage/documents/doc%2Fscan/scan-status',
    ]);
    expect(() => service.scanStatus$('   ')).toThrow('Document id is required.');
  });

  it('deduplicates repeated scan events and surfaces scan-status errors', async () => {
    const repeated: StynxDocumentScanEvent[] = [
      { id: 'doc-scan', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z' },
      { id: 'doc-scan', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z' },
      { id: 'doc-scan', status: 'completed', checkedAt: '2026-05-19T06:40:01.000Z' },
    ];
    const service = runInInjectionContext(
      Injector.create({
        providers: [
          {
            provide: HttpClient,
            useValue: {
              get: vi.fn(() => of(repeated.shift() ?? { id: 'doc-scan', status: 'completed' as const })),
            },
          },
          {
            provide: STYNX_ANGULAR_OPTIONS,
            useValue: {
              apiBaseUrl: 'https://api.example.test/',
              sessionMode: 'bearer',
            },
          },
        ],
      }),
      () => new DocumentService(),
    );

    await expect(firstValueFrom(service.scanStatus$('doc-scan', { pollIntervalMs: 1 }).pipe(toArray())))
      .resolves.toEqual([
        { id: 'doc-scan', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z' },
        { id: 'doc-scan', status: 'completed', checkedAt: '2026-05-19T06:40:01.000Z' },
      ]);

    const failing = createUploadComponent(
      {
        initiate: vi.fn(async () => ({
          id: 'doc-failing-scan',
          s3Key: 'storage/doc-failing-scan',
          upload: { method: 'PUT' as const, url: 'https://upload.example.test', headers: {}, expiresInSeconds: 60 },
        })),
        complete: vi.fn(async () => ({ id: 'doc-failing-scan', scanStatus: 'pending' as const })),
        scanStatus$: vi.fn(() => throwError(() => new Error('scan channel offline'))),
      },
      { push: () => undefined } as never,
      { upload: vi.fn(async (_url, _file, _headers, onProgress) => onProgress(100)) },
    );

    await failing.upload(new File(['body'], 'scan.pdf', { type: 'application/pdf' }));

    expect(failing.errorMessage).toBe('scan channel offline');

    const fallbackFailing = createUploadComponent(
      {
        initiate: vi.fn(async () => ({
          id: 'doc-fallback-scan',
          s3Key: 'storage/doc-fallback-scan',
          upload: { method: 'PUT' as const, url: 'https://upload.example.test', headers: {}, expiresInSeconds: 60 },
        })),
        complete: vi.fn(async () => ({ id: 'doc-fallback-scan', scanStatus: 'pending' as const })),
        scanStatus$: vi.fn(() => throwError(() => 'offline')),
      },
      { push: () => undefined } as never,
      { upload: vi.fn(async (_url, _file, _headers, onProgress) => onProgress(100)) },
    );

    await fallbackFailing.upload(new File(['body'], 'scan.pdf', { type: 'application/pdf' }));

    expect(fallbackFailing.errorMessage).toBe('Scan status unavailable');
  });

  it('distinguishes scan events by id, status, checkedAt, and message while polling', async () => {
    const responses: StynxDocumentScanEvent[] = [
      { id: 'doc-scan-a', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z', message: 'same' },
      { id: 'doc-scan-b', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z', message: 'same' },
      { id: 'doc-scan-b', status: 'pending', checkedAt: '2026-05-19T06:40:01.000Z', message: 'same' },
      { id: 'doc-scan-b', status: 'pending', checkedAt: '2026-05-19T06:40:01.000Z', message: 'changed' },
      { id: 'doc-scan-b', status: 'failed', checkedAt: '2026-05-19T06:40:01.000Z', message: 'changed' },
    ];
    const service = runInInjectionContext(
      Injector.create({
        providers: [
          {
            provide: HttpClient,
            useValue: {
              get: vi.fn(() => of(responses.shift() ?? { id: 'doc-scan-b', status: 'failed' as const })),
            },
          },
          {
            provide: STYNX_ANGULAR_OPTIONS,
            useValue: {
              apiBaseUrl: 'https://api.example.test/',
              sessionMode: 'bearer',
            },
          },
        ],
      }),
      () => new DocumentService(),
    );

    await expect(firstValueFrom(service.scanStatus$('doc-scan-a', { pollIntervalMs: 1 }).pipe(toArray())))
      .resolves.toEqual([
        { id: 'doc-scan-a', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z', message: 'same' },
        { id: 'doc-scan-b', status: 'pending', checkedAt: '2026-05-19T06:40:00.000Z', message: 'same' },
        { id: 'doc-scan-b', status: 'pending', checkedAt: '2026-05-19T06:40:01.000Z', message: 'same' },
        { id: 'doc-scan-b', status: 'pending', checkedAt: '2026-05-19T06:40:01.000Z', message: 'changed' },
        { id: 'doc-scan-b', status: 'failed', checkedAt: '2026-05-19T06:40:01.000Z', message: 'changed' },
      ]);
  });

  it('uploads files through XMLHttpRequest with progress, success, and failure paths', async () => {
    const original = globalThis.XMLHttpRequest;
    Object.defineProperty(globalThis, 'XMLHttpRequest', {
      configurable: true,
      value: FakeXmlHttpRequest,
    });
    FakeXmlHttpRequest.instances = [];
    const executor = new XhrUploadExecutor();
    const progress: number[] = [];

    try {
      const success = executor.upload(
        'https://upload.example.test/file',
        { name: 'test.pdf' } as File,
        { 'content-type': 'application/pdf' },
        (value) => progress.push(value),
      );
      const request = FakeXmlHttpRequest.instances[0];
      expect(request).toMatchObject({
        method: 'PUT',
        url: 'https://upload.example.test/file',
        async: true,
        headers: { 'content-type': 'application/pdf' },
        body: { name: 'test.pdf' },
      });
      request?.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 10 } as ProgressEvent);
      request?.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 0 } as ProgressEvent);
      request?.upload.onprogress?.({ lengthComputable: true, loaded: 3, total: 10 } as ProgressEvent);
      request!.status = 204;
      request?.onload?.();
      await expect(success).resolves.toBe(undefined);
      expect(progress).toEqual([30, 100]);

      const status200 = executor.upload('https://upload.example.test/ok-200', {} as File, {}, () => undefined);
      FakeXmlHttpRequest.instances[1]!.status = 200;
      FakeXmlHttpRequest.instances[1]?.onload?.();
      await expect(status200).resolves.toBe(undefined);

      const status300 = executor.upload('https://upload.example.test/ok-300', {} as File, {}, () => undefined);
      FakeXmlHttpRequest.instances[2]!.status = 300;
      FakeXmlHttpRequest.instances[2]?.onload?.();
      await expect(status300).rejects.toThrow('Upload failed with status 300');

      const statusFailure = executor.upload('https://upload.example.test/fail', {} as File, {}, () => undefined);
      const failed = FakeXmlHttpRequest.instances[3];
      failed!.status = 500;
      failed?.onload?.();
      await expect(statusFailure).rejects.toThrow('Upload failed with status 500');

      const networkFailure = executor.upload('https://upload.example.test/offline', {} as File, {}, () => undefined);
      FakeXmlHttpRequest.instances[4]?.onerror?.();
      await expect(networkFailure).rejects.toThrow('Upload failed');
    } finally {
      Object.defineProperty(globalThis, 'XMLHttpRequest', {
        configurable: true,
        value: original,
      });
    }
  });

  it('delegates small files from multipart executor to the XHR executor', async () => {
    const progress: number[] = [];
    const delegate: StynxUploadExecutor = {
      upload: vi.fn(async (
        _url: string,
        _file: File,
        _headers: Record<string, string>,
        onProgress: (value: number) => void,
      ) => {
        onProgress(100);
      }),
    };
    const executor = createMultipartExecutor(
      {
        chunkThreshold: 10,
        chunkSize: 4,
        concurrency: 1,
      },
      delegate,
    );
    const file = new File(['small'], 'small.txt', { type: 'text/plain' });

    await executor.upload('https://upload.example.test/single', file, { 'x-upload': 'one' }, (value) => progress.push(value));

    expect(delegate.upload).toHaveBeenCalledWith(
      'https://upload.example.test/single',
      file,
      { 'x-upload': 'one' },
      expect.any(Function),
    );
    expect(progress).toEqual([100]);
  });

  it('delegates files exactly at the multipart threshold', async () => {
    const delegate: StynxUploadExecutor = {
      upload: vi.fn(async () => undefined),
    };
    const executor = createMultipartExecutor(
      {
        chunkThreshold: 5,
        chunkSize: 2,
        concurrency: 1,
      },
      delegate,
    );
    const file = new File(['12345'], 'threshold.txt', { type: 'text/plain' });

    await executor.upload('https://upload.example.test/single', file, {}, () => undefined);

    expect(delegate.upload).toHaveBeenCalledWith(
      'https://upload.example.test/single',
      file,
      {},
      expect.any(Function),
    );
  });

  it('uploads large files as resumable multipart chunks', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const chunkBodySizes: number[] = [];
    const progress: number[] = [];
    const firstChunkAttempts: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(init ? { url, init } : { url });
      if (url.endsWith('/storage/uploads/initiate-multipart')) {
        return makeResponse(JSON.stringify({
          uploadId: 'upload-1',
          chunks: [
            { partNumber: 3, url: 'https://upload.example.test/chunk-3' },
            { partNumber: 1, url: 'https://upload.example.test/chunk-1', headers: { 'x-part': '1' } },
            { partNumber: 2, url: 'https://upload.example.test/chunk-2' },
          ],
        }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://upload.example.test/chunk-1') {
        firstChunkAttempts.push(url);
        chunkBodySizes.push((init?.body as Blob).size);
        return makeResponse('', { status: 500 });
      }
      if (url.endsWith('/storage/uploads/upload-1')) {
        return makeResponse(JSON.stringify({
          uploadId: 'upload-1',
          completedParts: [{ partNumber: 1, etag: 'etag-1-from-status' }],
        }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://upload.example.test/chunk-2') {
        chunkBodySizes.push((init?.body as Blob).size);
        return makeResponse('', { headers: { etag: 'etag-2' } });
      }
      if (url === 'https://upload.example.test/chunk-3') {
        chunkBodySizes.push((init?.body as Blob).size);
        return makeResponse('', { headers: { etag: 'etag-3' } });
      }
      if (url.endsWith('/storage/uploads/complete-multipart')) {
        return makeResponse(JSON.stringify({ uploadId: 'upload-1', completed: true }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });
    const executor = createMultipartExecutor({
      chunkThreshold: 5,
      chunkSize: 4,
      concurrency: 1,
      retryAttempts: 1,
    });

    try {
      await executor.upload(
        'https://upload.example.test/original',
        new File(['0123456789'], 'large.bin', { type: 'application/octet-stream' }),
        { 'x-upload': 'multi' },
        (value) => progress.push(value),
      );
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
    }

    const initiateBody = JSON.parse(calls[0]?.init?.body as string) as Record<string, unknown>;
    const completeCall = calls.find((call) => call.url.endsWith('/storage/uploads/complete-multipart'));
    const completeBody = JSON.parse(completeCall?.init?.body as string) as Record<string, unknown>;

    expect(initiateBody).toMatchObject({
      uploadUrl: 'https://upload.example.test/original',
      filename: 'large.bin',
      mimeType: 'application/octet-stream',
      byteSize: 10,
      chunkSize: 4,
      chunkCount: 3,
      headers: { 'x-upload': 'multi' },
    });
    expect(calls[0]?.init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(firstChunkAttempts).toHaveLength(1);
    expect(calls.map((call) => call.url)).toContain('https://api.example.test/storage/uploads/upload-1');
    expect(chunkBodySizes).toEqual([4, 4, 2]);
    expect(completeBody).toEqual({
      uploadId: 'upload-1',
      parts: [
        { partNumber: 1, etag: 'etag-1-from-status' },
        { partNumber: 2, etag: 'etag-2' },
        { partNumber: 3, etag: 'etag-3' },
      ],
    });
    expect(completeCall?.init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(progress).toEqual([0, 40, 80, 99, 100]);
  });

  it('sends exact multipart PUT requests and byte-weighted progress for unsorted chunks', async () => {
    const originalFetch = globalThis.fetch;
    const putCalls: Array<{ url: string; init: RequestInit; bodyText: string }> = [];
    const progress: number[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/storage/uploads/initiate-multipart')) {
          return makeResponse(JSON.stringify({
            uploadId: 'upload-unsorted',
            chunks: [
              { partNumber: 2, url: 'https://upload.example.test/chunk-2', headers: { 'x-part': '2' } },
              { partNumber: 1, url: 'https://upload.example.test/chunk-1', headers: { 'x-part': '1' } },
            ],
          }), { headers: { 'content-type': 'application/json' } });
        }
        if (url.startsWith('https://upload.example.test/chunk-')) {
          putCalls.push({
            url,
            init: init ?? {},
            bodyText: await (init?.body as Blob).text(),
          });
          return makeResponse('', { headers: { etag: `etag-${url.at(-1)}` } });
        }
        if (url.endsWith('/storage/uploads/complete-multipart')) {
          return makeResponse(JSON.stringify({ uploadId: 'upload-unsorted', completed: true }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`Unexpected fetch ${url}`);
      }),
    });

    try {
      await createMultipartExecutor({
        chunkThreshold: 1,
        chunkSize: 4,
        concurrency: 1,
        retryAttempts: 0,
      }).upload(
        'https://upload.example.test/original',
        new File(['abcdefgh'], 'large.bin', { type: 'application/octet-stream' }),
        { 'x-upload': 'multi' },
        (value) => progress.push(value),
      );
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
    }

    expect(putCalls).toEqual([
      {
        url: 'https://upload.example.test/chunk-1',
        init: expect.objectContaining({
          method: 'PUT',
          headers: { 'x-upload': 'multi', 'x-part': '1' },
        }),
        bodyText: 'abcd',
      },
      {
        url: 'https://upload.example.test/chunk-2',
        init: expect.objectContaining({
          method: 'PUT',
          headers: { 'x-upload': 'multi', 'x-part': '2' },
        }),
        bodyText: 'efgh',
      },
    ]);
    expect(progress).toEqual([0, 50, 99, 100]);
  });

  it('uses multipart status numbers, explicit completion URL, and failure statuses', async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/storage/uploads/initiate-multipart')) {
        return makeResponse(JSON.stringify({
          uploadId: 'upload-explicit',
          completeUrl: 'https://upload.example.test/custom-complete',
          chunks: [
            { partNumber: 1, url: 'https://upload.example.test/chunk-1' },
            { partNumber: 2, url: 'https://upload.example.test/chunk-2' },
          ],
        }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://upload.example.test/chunk-1') {
        return makeResponse('', { status: 503 });
      }
      if (url.endsWith('/storage/uploads/upload-explicit')) {
        return makeResponse(JSON.stringify({
          uploadId: 'upload-explicit',
          completedParts: [1],
        }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === 'https://upload.example.test/chunk-2') {
        return makeResponse('', { headers: { etag: 'etag-2' } });
      }
      if (url === 'https://upload.example.test/custom-complete') {
        return makeResponse(JSON.stringify({ uploadId: 'upload-explicit', completed: true }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: fetchMock,
    });

    try {
      await createMultipartExecutor({
        chunkThreshold: 5,
        chunkSize: 4,
        concurrency: 1,
        retryAttempts: 1,
      }).upload(
        'https://upload.example.test/original',
        new File(['0123456789'], 'large.bin', { type: 'application/octet-stream' }),
        {},
        () => undefined,
      );
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
    }

    expect(calls).toContain('https://upload.example.test/custom-complete');

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/storage/uploads/initiate-multipart')
          ? makeResponse('', { status: 503 })
          : makeResponse(''),
      ),
    });
    try {
      await expect(createMultipartExecutor({
        chunkThreshold: 1,
        chunkSize: 1,
        concurrency: 1,
        retryAttempts: 0,
      }).upload('https://upload.example.test/original', new File(['large'], 'large.bin'), {}, () => undefined))
        .rejects.toThrow('Multipart upload initiation failed with status 503');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
    }
  });

  it('surfaces exhausted multipart retries, completion failures, and provider wiring', async () => {
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/storage/uploads/initiate-multipart')) {
          return makeResponse(JSON.stringify({
            uploadId: 'upload-fail',
            chunks: [{ partNumber: 1, url: 'https://upload.example.test/chunk-1' }],
          }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === 'https://upload.example.test/chunk-1') {
          return makeResponse('', { status: 500 });
        }
        if (url.endsWith('/storage/uploads/upload-fail')) {
          return makeResponse(JSON.stringify({ uploadId: 'upload-fail', completedParts: [] }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        return makeResponse('');
      }),
    });

    try {
      await expect(createMultipartExecutor({
        chunkThreshold: 1,
        chunkSize: 2,
        concurrency: 1,
        retryAttempts: 1,
      }).upload('https://upload.example.test/original', new File(['large'], 'large.bin'), {}, () => undefined))
        .rejects.toThrow('Multipart chunk 1 failed with status 500');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
    }

    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/storage/uploads/initiate-multipart')) {
          return makeResponse(JSON.stringify({
            uploadId: 'upload-complete-fail',
            chunks: [{ partNumber: 1, url: 'https://upload.example.test/chunk-1' }],
          }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url === 'https://upload.example.test/chunk-1') {
          return makeResponse('', { headers: { etag: 'etag-1' } });
        }
        if (url.endsWith('/storage/uploads/complete-multipart')) {
          return makeResponse('', { status: 409 });
        }
        return makeResponse('');
      }),
    });
    try {
      await expect(createMultipartExecutor({
        chunkThreshold: 1,
        chunkSize: 2,
        concurrency: 1,
        retryAttempts: 0,
      }).upload('https://upload.example.test/original', new File(['large'], 'large.bin'), {}, () => undefined))
        .rejects.toThrow('Multipart upload completion failed with status 409');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
    }

    expect(provideStynxMultipartUploadExecutor({ chunkSize: 8 })).toEqual([
      XhrUploadExecutor,
      MultipartUploadExecutor,
      {
        provide: STYNX_MULTIPART_UPLOAD_OPTIONS,
        useValue: {
          ...STYNX_DEFAULT_MULTIPART_UPLOAD_OPTIONS,
          chunkSize: 8,
        },
      },
      {
        provide: STYNX_UPLOAD_EXECUTOR,
        useExisting: MultipartUploadExecutor,
      },
    ]);
  });

  it('retries multipart chunks exactly through the configured final attempt', async () => {
    const originalFetch = globalThis.fetch;
    const chunkCalls: string[] = [];
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/storage/uploads/initiate-multipart')) {
          return makeResponse(JSON.stringify({
            uploadId: 'upload-retry',
            chunks: [{ partNumber: 1, url: 'https://upload.example.test/chunk-1' }],
          }), { headers: { 'content-type': 'application/json' } });
        }
        if (url === 'https://upload.example.test/chunk-1') {
          chunkCalls.push(url);
          return makeResponse('', { status: 500 });
        }
        if (url.endsWith('/storage/uploads/upload-retry')) {
          return makeResponse(JSON.stringify({ uploadId: 'upload-retry', completedParts: [] }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        return makeResponse('');
      }),
    });

    try {
      await expect(createMultipartExecutor({
        chunkThreshold: 1,
        chunkSize: 2,
        concurrency: 1,
        retryAttempts: 2,
      }).upload('https://upload.example.test/original', new File(['large'], 'large.bin'), {}, () => undefined))
        .rejects.toThrow('Multipart chunk 1 failed with status 500');
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: originalFetch,
      });
    }

    expect(chunkCalls).toEqual([
      'https://upload.example.test/chunk-1',
      'https://upload.example.test/chunk-1',
      'https://upload.example.test/chunk-1',
    ]);
  });
});
