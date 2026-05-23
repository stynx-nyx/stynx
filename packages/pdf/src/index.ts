/**
 * Public server-side PDF rendering facade exports.
 *
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import type { PdfRenderBackend, RenderRequest, RenderResult } from './types';

export * from './types';

class UnimplementedPdfRenderBackend implements PdfRenderBackend {
  async render<TData extends Record<string, unknown>>(
    _request: RenderRequest<TData>,
  ): Promise<RenderResult> {
    // TODO(stynx-pdf): port from PEC origin path ../pec/domain/documents-document-mgmt/.
    throw new Error('No @stynx/pdf render backend configured');
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export class PdfRenderer {
  constructor(private readonly backend: PdfRenderBackend = new UnimplementedPdfRenderBackend()) {}

  async render<TData extends Record<string, unknown>>(
    request: RenderRequest<TData>,
  ): Promise<RenderResult> {
    if (!request.tenantId) {
      throw new Error('tenantId is required to render a PDF');
    }
    if (!request.template.id) {
      throw new Error('template.id is required to render a PDF');
    }
    return this.backend.render(request);
  }
}

export function createFixturePdfBackend(): PdfRenderBackend {
  return {
    async render(request) {
      const body = interpolate(request.template.source, request.data);
      const bytes = Buffer.from(`%PDF-STYNX-FIXTURE\n${body}\n%%EOF\n`);
      return {
        bytes,
        contentType: 'application/pdf',
        sha256: sha256Hex(bytes),
        pageCount: 1,
        templateId: request.template.id,
        metadata: {
          tenantId: request.tenantId,
          engine: request.template.engine,
          ...(request.metadata ?? {}),
        },
        ...(request.template.version ? { templateVersion: request.template.version } : {}),
      };
    },
  };
}
