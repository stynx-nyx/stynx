import { interpolate, sha256Hex } from './pdf-renderer';
import type { PdfRenderBackend } from './types';

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
