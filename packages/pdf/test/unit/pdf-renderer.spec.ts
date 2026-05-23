import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import {
  LocalPdfRenderBackend,
  PdfProfileUnsupportedError,
  PdfRenderer,
  PdfValidationError,
  StynxPdfModule,
  createFixturePdfBackend,
} from '../../src';

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('PdfRenderer', () => {
  it('renders a fixture template and returns stable bytes for signature input', async () => {
    const renderer = new PdfRenderer(createFixturePdfBackend());

    const result = await renderer.render({
      tenantId: 'tenant-a',
      template: {
        id: 'receipt',
        engine: 'fixture',
        source: 'Receipt {{number}} for {{name}}',
        version: '1',
      },
      data: {
        number: 'AIT-1',
        name: 'Driver',
      },
    });

    expect(Buffer.from(result.bytes).toString('utf8')).toContain('Receipt AIT-1 for Driver');
    expect(result.contentType).toBe('application/pdf');
    expect(result.sha256).toBe(sha256Hex(result.bytes));
    expect(result.pageCount).toBe(1);
  });

  it('renders local HTML into real PDF bytes', async () => {
    const renderer = new PdfRenderer(new LocalPdfRenderBackend());

    const result = await renderer.render({
      tenantId: 'tenant-a',
      template: {
        id: 'html-receipt',
        engine: 'html',
        source: '<html><body><h1>Receipt AIT-1</h1></body></html>',
      },
      data: {},
    });

    expect(Buffer.from(result.bytes).subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(result.sha256).toBe(sha256Hex(result.bytes));
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
  }, 30_000);

  it('renders local Handlebars templates', async () => {
    const renderer = new PdfRenderer(new LocalPdfRenderBackend());

    const result = await renderer.render({
      tenantId: 'tenant-a',
      template: {
        id: 'hbs-receipt',
        engine: 'handlebars',
        source: '<html><body><h1>Receipt {{number}}</h1></body></html>',
      },
      data: { number: 'AIT-2' },
      metadata: { source: 'unit' },
    });

    expect(Buffer.from(result.bytes).subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(result.metadata).toMatchObject({
      tenantId: 'tenant-a',
      engine: 'handlebars',
      source: 'unit',
    });
  }, 30_000);

  it('requires tenant scope', async () => {
    const renderer = new PdfRenderer(createFixturePdfBackend());

    await expect(
      renderer.render({
        tenantId: '',
        template: { id: 'receipt', engine: 'fixture', source: 'x' },
        data: {},
      }),
    ).rejects.toBeInstanceOf(PdfValidationError);
  });

  it('fails PDF/A requests without a conformance adapter', async () => {
    const renderer = new PdfRenderer(new LocalPdfRenderBackend());

    await expect(
      renderer.render({
        tenantId: 'tenant-a',
        template: {
          id: 'pdf-a',
          engine: 'html',
          source: '<html><body>Archive</body></html>',
        },
        data: {},
        output: { profile: 'pdf-a' },
      }),
    ).rejects.toBeInstanceOf(PdfProfileUnsupportedError);
  }, 30_000);
});

describe('StynxPdfModule', () => {
  it('wires PdfRenderer with the default local backend', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StynxPdfModule.forRoot()],
    }).compile();

    expect(moduleRef.get(PdfRenderer)).toBeInstanceOf(PdfRenderer);
    await moduleRef.close();
  });
});
