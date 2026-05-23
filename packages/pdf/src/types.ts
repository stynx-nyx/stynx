export type TemplateEngine = 'fixture' | 'handlebars' | 'html';

export interface PdfBranding {
  tenantId?: string;
  logoUri?: string;
  fontFamily?: string;
  primaryColor?: string;
  locale?: string;
}

export interface TemplateRef {
  id: string;
  engine: TemplateEngine;
  source: string;
  version?: string;
}

export interface RenderRequest<TData extends Record<string, unknown> = Record<string, unknown>> {
  tenantId: string;
  template: TemplateRef;
  data: TData;
  branding?: PdfBranding;
  metadata?: Record<string, string>;
  output?: {
    format?: 'pdf';
    profile?: 'pdf' | 'pdf-a';
    fileName?: string;
  };
}

export interface RenderResult {
  bytes: Uint8Array;
  contentType: 'application/pdf';
  sha256: string;
  pageCount: number;
  templateId: string;
  templateVersion?: string;
  metadata: Record<string, string>;
}

export interface PdfRenderBackend {
  render<TData extends Record<string, unknown>>(
    request: RenderRequest<TData>,
  ): Promise<RenderResult>;
}
