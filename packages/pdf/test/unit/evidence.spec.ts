import { decodePadesEvidenceBlock } from '@stynx/signature';
import { FixedLayoutDocumentBuilder, PdfVerificationEvidenceAppender } from '../../src';

describe('PdfVerificationEvidenceAppender', () => {
  it('draws a verification hint and appends STYNX PAdES evidence', async () => {
    const payload = await validPdfPayload();
    const appender = new PdfVerificationEvidenceAppender({
      defaultSignerName: 'SGP report-service',
    });

    const signed = await appender.embedVerificationHint({
      payload,
      verifyUrl: '/verify/document',
      reason: 'Official report',
      signedAt: '2026-05-24T12:00:00.000Z',
    });

    expect(Buffer.from(signed).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const signedText = Buffer.from(signed).toString('latin1');
    expect(signedText.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(signedText.indexOf('%%STYNX-PADES-SIGNATURE:')).toBeLessThan(
      signedText.lastIndexOf('%%EOF'),
    );
    expect(decodePadesEvidenceBlock(signed)).toMatchObject({
      format: 'PAdES',
      profile: 'PAdES-B-B',
      signerName: 'SGP report-service',
      signedAt: '2026-05-24T12:00:00.000Z',
      reason: 'Official report',
      verifyUrl: '/verify/document',
    });
  });

  it('uses a package-neutral fallback marker for non-PDF payloads', async () => {
    const appender = new PdfVerificationEvidenceAppender({
      defaultSignerName: 'SGP report-service',
    });

    const signed = await appender.embedVerificationHint({
      payload: Buffer.from('not a pdf', 'utf8'),
      verifyUrl: '/verify/fallback',
      signedAt: '2026-05-24T12:00:00.000Z',
    });
    const text = Buffer.from(signed).toString('latin1');

    expect(text).toContain('%%STYNX-PDF-VERIFY:/verify/fallback');
    expect(decodePadesEvidenceBlock(signed)).toMatchObject({
      signerName: 'SGP report-service',
      verifyUrl: '/verify/fallback',
    });
  });
});

async function validPdfPayload(): Promise<Uint8Array> {
  const builder = await FixedLayoutDocumentBuilder.create({
    title: 'Fixture',
    subject: 'Evidence fixture',
    author: 'STYNX',
    creator: 'STYNX test',
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
  });
  const context = await builder.addPage();
  context.drawText('Evidence fixture', context.margin);
  return builder.save();
}
