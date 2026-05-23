import { createHash } from 'node:crypto';
import { PdfRenderer, createFixturePdfBackend } from '../../src';

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

  it('requires tenant scope', async () => {
    const renderer = new PdfRenderer(createFixturePdfBackend());

    await expect(
      renderer.render({
        tenantId: '',
        template: { id: 'receipt', engine: 'fixture', source: 'x' },
        data: {},
      }),
    ).rejects.toThrow('tenantId is required');
  });
});
