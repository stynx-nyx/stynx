import { FixedLayoutDocumentBuilder, validatePdfAStyle } from '../../src';

describe('fixed-layout PDF helpers', () => {
  it('renders deterministic structural PDF bytes with stable metadata', async () => {
    const first = await renderSimplePdf();
    const second = await renderSimplePdf();

    expect(Buffer.from(first).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(validatePdfAStyle(first)).toEqual({ valid: true, reasons: [] });
  });

  it('reports honest PDF/A-style structural validation failures', () => {
    expect(validatePdfAStyle(Buffer.from('not-pdf'))).toEqual({
      valid: false,
      reasons: [
        'missing PDF header',
        'missing document title metadata',
        'missing creator metadata',
        'missing font resources',
      ],
    });
  });
});

async function renderSimplePdf(): Promise<Uint8Array> {
  const builder = await FixedLayoutDocumentBuilder.create({
    title: 'Fixture',
    subject: 'Structural PDF fixture',
    author: 'STYNX',
    creator: 'fixed-layout.spec',
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
  });
  const page = await builder.addPage();
  page.drawText('Fixture PDF', page.margin, 12, page.fonts.bold);
  return builder.save();
}
