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

  it('uses default evidence metadata and returns null when no envelope exists', () => {
    const result = createMockPadesEvidenceAdapter(() => new Date('2026-01-01T00:00:00.000Z')).sign({
      payload: Buffer.from('%PDF'),
      verifyUrl: '/verify',
    });
    expect(result.envelope).toMatchObject({
      signerName: 'STYNX mock PAdES signer',
      signedAt: '2026-01-01T00:00:00.000Z',
      reason: 'Official PDF signature',
      evidenceUri: expect.stringMatching(/^stynx-pades:\/\/evidence\//u),
    });
    expect(decodePadesEvidenceBlock(Buffer.from('%PDF without envelope'))).toBeNull();
    expect(createMockPadesEvidenceAdapter().sign({ payload: Buffer.from('x'), verifyUrl: '/' })
      .envelope.signedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('uses caller-supplied evidence metadata and surfaces corrupt envelopes', () => {
    const signed = createMockPadesEvidenceAdapter().sign({
      payload: Buffer.from('%PDF'),
      verifyUrl: '/verify',
      signedAt: '2026-02-03T04:05:06.000Z',
      signerName: 'Caller signer',
      reason: 'Caller reason',
      evidenceUri: 'evidence://caller',
    });
    expect(signed.envelope).toMatchObject({
      signedAt: '2026-02-03T04:05:06.000Z',
      signerName: 'Caller signer',
      reason: 'Caller reason',
      evidenceUri: 'evidence://caller',
    });
    const corrupt = Buffer.from('%%STYNX-PADES-SIGNATURE:bm90IGpzb24=');
    expect(() => decodePadesEvidenceBlock(corrupt)).toThrow();
  });
});
