import Handlebars from 'handlebars';
import { chromium } from 'playwright';
import { PdfProfileUnsupportedError, PdfRenderError, PdfValidationError } from './errors';
import { sha256Hex } from './pdf-renderer';
import type { LocalPdfRendererOptions, PdfRenderBackend, RenderRequest, RenderResult } from './types';

export class LocalPdfRenderBackend implements PdfRenderBackend {
  constructor(private readonly options: LocalPdfRendererOptions = {}) {}

  async render<TData extends Record<string, unknown>>(
    request: RenderRequest<TData>,
  ): Promise<RenderResult> {
    if (request.template.engine === 'fixture') {
      throw new PdfValidationError('fixture templates require createFixturePdfBackend()');
    }
    // Fast-fail precondition: PDF/A profile without a conformance adapter is
    // unsupported. Check BEFORE the expensive Chromium render so callers don't
    // pay the render cost on a request that can never succeed. The unit test at
    // packages/pdf/test/unit/pdf-renderer.spec.ts:92 (`fails PDF/A requests
    // without a conformance adapter`) previously timed out at 30s on stressed
    // hosts because the check ran AFTER renderHtmlToPdf — see R15 closeout
    // follow-up.
    if (request.output?.profile === 'pdf-a' && !this.options.pdfAAdapter) {
      throw new PdfProfileUnsupportedError();
    }
    const html = this.renderHtml(request);
    const result = await this.renderHtmlToPdf(request, html);
    if (request.output?.profile === 'pdf-a') {
      // pdfAAdapter presence already validated above.
      return this.options.pdfAAdapter!.convert(result, request);
    }
    return result;
  }

  private renderHtml(request: RenderRequest): string {
    if (request.template.engine === 'html') {
      return request.template.source;
    }
    if (request.template.engine === 'handlebars') {
      const template = Handlebars.compile(request.template.source, { strict: false });
      return template({
        ...request.data,
        branding: request.branding,
        metadata: request.metadata,
      });
    }
    throw new PdfValidationError(`Unsupported template engine: ${request.template.engine}`);
  }

  private async renderHtmlToPdf(request: RenderRequest, html: string): Promise<RenderResult> {
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      browser = await chromium.launch({
        headless: true,
        ...(this.options.launchOptions ?? {}),
      });
      const page = await browser.newPage();
      page.setDefaultTimeout(this.options.timeoutMs ?? 15_000);
      await page.setContent(withBaseHref(html, this.options.baseUrl), {
        waitUntil: 'networkidle',
      });
      const bytes = await page.pdf({
        printBackground: true,
        format: 'A4',
        preferCSSPageSize: true,
        ...(this.options.defaultPdfOptions ?? {}),
        ...(request.output?.pdf ?? {}),
      });
      return {
        bytes,
        contentType: 'application/pdf',
        sha256: sha256Hex(bytes),
        pageCount: countPdfPages(bytes),
        templateId: request.template.id,
        metadata: {
          ...(this.options.defaultMetadata ?? {}),
          tenantId: request.tenantId,
          engine: request.template.engine,
          profile: request.output?.profile ?? 'pdf',
          ...(request.metadata ?? {}),
        },
        ...(request.template.version ? { templateVersion: request.template.version } : {}),
      };
    } catch (error) {
      if (error instanceof PdfProfileUnsupportedError || error instanceof PdfValidationError) {
        throw error;
      }
      throw new PdfRenderError(`Local PDF rendering failed: ${errorMessage(error)}`, {
        cause: error,
      });
    } finally {
      await browser?.close();
    }
  }
}

export function countPdfPages(bytes: Uint8Array): number {
  const content = Buffer.from(bytes).toString('latin1');
  const matches = content.match(/\/Type\s*\/Page\b/g);
  return Math.max(1, matches?.length ?? 0);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withBaseHref(html: string, baseUrl: string | undefined): string {
  if (!baseUrl) {
    return html;
  }
  const tag = `<base href="${escapeAttribute(baseUrl)}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  }
  return `${tag}${html}`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
