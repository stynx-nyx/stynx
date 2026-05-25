import { createMockPadesEvidenceAdapter, decodePadesEvidenceBlock, sha256 } from '../../src';

describe('MockPadesEvidenceAdapter', () => {
  it('produces a deterministic PAdES evidence envelope for SGP PDF bytes', () => {
    const adapter = createMockPadesEvidenceAdapter(() => new Date('2026-05-24T12:00:00.000Z'));
    const payload = Buffer.from('%PDF-sgp');

    const result = adapter.sign({
      payload,
      verifyUrl: '/v1/portal/payslips/emp/2026-05/pdf',
      reason: 'Contracheque 2026-05',
      signerName: 'Municipio de Teste',
    });

    expect(result.envelope).toMatchObject({
      format: 'PAdES',
      profile: 'PAdES-B-B',
      signerName: 'Municipio de Teste',
      signedAt: '2026-05-24T12:00:00.000Z',
      reason: 'Contracheque 2026-05',
      verifyUrl: '/v1/portal/payslips/emp/2026-05/pdf',
      payloadSha256: sha256(payload),
    });
    expect(decodePadesEvidenceBlock(result.signedDocument)).toEqual(result.envelope);
  });
});
