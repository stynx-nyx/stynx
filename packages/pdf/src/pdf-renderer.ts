import { createHash } from 'node:crypto';
import { PdfValidationError } from './errors';
import type { PdfRenderBackend, RenderRequest, RenderResult } from './types';

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export class PdfRenderer {
  constructor(private readonly backend: PdfRenderBackend) {}

  async render<TData extends Record<string, unknown>>(
    request: RenderRequest<TData>,
  ): Promise<RenderResult> {
    if (!request.tenantId) {
      throw new PdfValidationError('tenantId is required to render a PDF');
    }
    if (!request.template.id) {
      throw new PdfValidationError('template.id is required to render a PDF');
    }
    if (!request.template.source) {
      throw new PdfValidationError('template.source is required to render a PDF');
    }
    return this.backend.render(request);
  }
}
