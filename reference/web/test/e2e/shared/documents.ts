import type { Page, Route } from '@playwright/test';
import { expect, referenceTenants } from '../fixtures';

type RecordItem = {
  id: string;
  tenantId: string;
  title: string;
  email: string;
  externalRef: string | null;
  status: 'active' | 'pending' | 'inactive';
  createdAt: string;
  updatedAt: string;
};

type UploadInitRequest = {
  collection: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
};

type DocumentMockOptions = {
  documentId?: string;
  initiateStatus?: number;
  initiateBody?: unknown;
  uploadStatus?: number;
  completeStatus?: number;
  completeBody?: unknown;
  downloadStatus?: number;
  downloadBody?: unknown;
  blobStatus?: number;
  blobBody?: Buffer | string;
  scanStatuses?: string[];
};

export type DocumentMockState = {
  initiateRequests: UploadInitRequest[];
  uploadRequests: Buffer[];
  completeRequests: string[];
  downloadRequests: string[];
  blobRequests: string[];
  scanRequests: string[];
};

const tenantId = referenceTenants.sampleDemo.id;
const createdAt = '2026-05-19T09:30:46.338Z';
const documentIdDefault = 'document-record-uploaded';
const recordsApiUrl = /^http:\/\/127\.0\.0\.1:3000\/records\/([^/?#]+)(?:\?.*)?$/;
const documentsApiUrl = /^http:\/\/127\.0\.0\.1:3000\/documents(?:\?.*)?$/;
const documentCompleteApiUrl = /^http:\/\/127\.0\.0\.1:3000\/documents\/([^/?#]+)\/complete(?:\?.*)?$/;
const documentDownloadApiUrl = /^http:\/\/127\.0\.0\.1:3000\/documents\/([^/?#]+)\/download(?:\?.*)?$/;
const scanStatusApiUrl = /^http:\/\/127\.0\.0\.1:3000\/storage\/documents\/([^/?#]+)\/scan-status(?:\?.*)?$/;
const uploadObjectUrl = /^http:\/\/127\.0\.0\.1:3100\/__document-upload\/([^/?#]+)(?:\?.*)?$/;
const downloadObjectUrl = /^http:\/\/127\.0\.0\.1:3100\/__document-download\/([^/?#]+)(?:\?.*)?$/;

export const recordDocumentFixture: RecordItem = {
  id: 'record-documents-primary',
  tenantId,
  title: 'Document-enabled record',
  email: 'documents-record@sample-demo.test',
  externalRef: 'DOC-REC-001',
  status: 'active',
  createdAt,
  updatedAt: createdAt,
};

function idFromUrl(url: string, marker: string): string {
  return url.split(marker)[1]?.split(/[?#/]/)[0] ?? '';
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installRecordDetailMock(page: Page, record: RecordItem = recordDocumentFixture): Promise<void> {
  await page.route(recordsApiUrl, async (route) => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
      return;
    }

    const id = idFromUrl(route.request().url(), '/records/');
    await fulfillJson(
      route,
      id === record.id ? 200 : 404,
      id === record.id
        ? record
        : {
          statusCode: 404,
          message: 'Record not found',
          error: 'Not Found',
        },
    );
  });
}

export async function openRecordDocumentCard(page: Page): Promise<void> {
  await page.goto(`/records/${recordDocumentFixture.id}`);
  await expect(page.getByTestId('record-detail-title')).toBeVisible();
  await expect(page.getByTestId('record-document-card')).toBeVisible();
  await expect(page.getByTestId('document-upload-root')).toHaveAttribute('data-upload-status', 'idle');
}

export async function installDocumentApiMocks(page: Page, options: DocumentMockOptions = {}): Promise<DocumentMockState> {
  const documentId = options.documentId ?? documentIdDefault;
  const state: DocumentMockState = {
    initiateRequests: [],
    uploadRequests: [],
    completeRequests: [],
    downloadRequests: [],
    blobRequests: [],
    scanRequests: [],
  };

  await page.route(documentsApiUrl, async (route) => {
    if (route.request().method() !== 'POST') {
      await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
      return;
    }

    const body = route.request().postDataJSON() as UploadInitRequest;
    state.initiateRequests.push(body);
    await fulfillJson(
      route,
      options.initiateStatus ?? 201,
      options.initiateBody ?? {
        id: documentId,
        s3Key: `${tenantId}/records/${documentId}/${body.filename}`,
        upload: {
          url: `http://127.0.0.1:3100/__document-upload/${documentId}`,
          headers: {},
        },
      },
    );
  });

  await page.route(uploadObjectUrl, async (route) => {
    const method = route.request().method();
    if (method !== 'PUT') {
      await route.fulfill({ status: 405, body: '' });
      return;
    }

    state.uploadRequests.push(route.request().postDataBuffer() ?? Buffer.from(''));
    await route.fulfill({
      status: options.uploadStatus ?? 200,
      body: '',
    });
  });

  await page.route(documentCompleteApiUrl, async (route) => {
    if (route.request().method() !== 'POST') {
      await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
      return;
    }

    const id = idFromUrl(route.request().url(), '/documents/');
    state.completeRequests.push(id);
    await fulfillJson(
      route,
      options.completeStatus ?? 201,
      options.completeBody ?? {
        id,
        scanStatus: 'completed',
      },
    );
  });

  await page.route(scanStatusApiUrl, async (route) => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
      return;
    }

    const id = idFromUrl(route.request().url(), '/storage/documents/');
    state.scanRequests.push(id);
    const statuses = options.scanStatuses ?? ['completed'];
    const index = Math.min(state.scanRequests.length - 1, statuses.length - 1);
    await fulfillJson(route, 200, {
      id,
      status: statuses[index],
      checkedAt: createdAt,
    });
  });

  await page.route(documentDownloadApiUrl, async (route) => {
    if (route.request().method() !== 'GET') {
      await fulfillJson(route, 405, { statusCode: 405, message: 'Method not allowed' });
      return;
    }

    const id = idFromUrl(route.request().url(), '/documents/');
    state.downloadRequests.push(id);
    await fulfillJson(
      route,
      options.downloadStatus ?? 200,
      options.downloadBody ?? {
        id,
        url: `http://127.0.0.1:3100/__document-download/${id}`,
        expiresInSeconds: 900,
      },
    );
  });

  await page.route(downloadObjectUrl, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fulfill({ status: 405, body: '' });
      return;
    }

    const id = idFromUrl(route.request().url(), '/__document-download/');
    state.blobRequests.push(id);
    const body = options.blobBody ?? Buffer.from('%PDF-1.4 downloaded document');
    await route.fulfill({
      status: options.blobStatus ?? 200,
      headers: {
        'content-disposition': 'attachment; filename="record-document.pdf"',
        'content-length': String(Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body)),
        'content-type': 'application/pdf',
      },
      body,
    });
  });

  return state;
}

export async function selectUploadFile(
  page: Page,
  options: { name?: string; mimeType?: string; body?: Buffer | string } = {},
): Promise<void> {
  const body = options.body ?? Buffer.from('%PDF-1.4 reference-web document');
  await page.getByTestId('document-upload-file-input').setInputFiles({
    name: options.name ?? 'record-document.pdf',
    mimeType: options.mimeType ?? 'application/pdf',
    buffer: Buffer.isBuffer(body) ? body : Buffer.from(body),
  });
}

export async function expectNoDocumentApiCalls(page: Page): Promise<{ initiateCalls: number }> {
  let initiateCalls = 0;
  await page.route(documentsApiUrl, async (route) => {
    initiateCalls += 1;
    await fulfillJson(route, 500, { statusCode: 500, message: 'Unexpected document API call' });
  });
  return {
    get initiateCalls() {
      return initiateCalls;
    },
  };
}
