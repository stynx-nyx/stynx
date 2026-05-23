import type { LaunchOptions } from 'playwright';

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

export interface PdfOutputOptions {
  format?: 'pdf';
  profile?: 'pdf' | 'pdf-a';
  fileName?: string;
  pdf?: PdfPageOptions;
}

export interface PdfPageOptions {
  displayHeaderFooter?: boolean;
  footerTemplate?: string;
  format?: string;
  headerTemplate?: string;
  height?: string | number;
  landscape?: boolean;
  margin?: {
    top?: string | number;
    right?: string | number;
    bottom?: string | number;
    left?: string | number;
  };
  outline?: boolean;
  pageRanges?: string;
  path?: string;
  preferCSSPageSize?: boolean;
  printBackground?: boolean;
  scale?: number;
  tagged?: boolean;
  width?: string | number;
}

export interface RenderRequest<TData extends Record<string, unknown> = Record<string, unknown>> {
  tenantId: string;
  template: TemplateRef;
  data: TData;
  branding?: PdfBranding;
  metadata?: Record<string, string>;
  output?: PdfOutputOptions;
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

export interface PdfAConformanceAdapter {
  convert(input: RenderResult, request: RenderRequest): Promise<RenderResult>;
}

export interface LocalPdfRendererOptions {
  launchOptions?: LaunchOptions;
  baseUrl?: string;
  timeoutMs?: number;
  defaultPdfOptions?: PdfPageOptions;
  defaultMetadata?: Record<string, string>;
  pdfAAdapter?: PdfAConformanceAdapter;
}

export interface StynxPdfModuleOptions extends LocalPdfRendererOptions {
  backend?: PdfRenderBackend;
}
