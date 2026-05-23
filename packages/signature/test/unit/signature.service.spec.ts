import { createHash } from 'node:crypto';
import { SignatureService, createMockSignatureBackend } from '../../src';

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('SignatureService', () => {
  it('signs and verifies a document through the configured backend', async () => {
    const now = new Date('2026-05-23T12:00:00.000Z');
    const service = new SignatureService(createMockSignatureBackend(() => now));
    const document = Buffer.from('pdf-a-bytes');
    const documentSha256 = sha256Hex(document);

    const signed = await service.sign({
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      document,
      documentSha256,
      tsa: { endpoint: 'https://tsa.example.test' },
      certificate: {
        subject: 'CN=Signer',
        issuer: 'CN=ICP Test',
        serialNumber: '01',
      },
    });

    const verified = await service.verify({
      tenantId: 'tenant-a',
      document,
      documentSha256,
      cmsSignature: signed.cmsSignature,
    });

    expect(signed.evidence.documentSha256).toBe(documentSha256);
    expect(signed.evidence.revocationSource).toBe('ocsp');
    expect(verified.status).toBe('valid');
    expect(verified.checkedAt.toISOString()).toBe('2026-05-23T12:00:00.000Z');
  });

  it('rejects mismatched document hashes before calling a backend', async () => {
    const service = new SignatureService(createMockSignatureBackend());

    await expect(
      service.sign({
        tenantId: 'tenant-a',
        actorId: 'actor-a',
        document: Buffer.from('pdf-a-bytes'),
        documentSha256: 'wrong',
        tsa: { endpoint: 'https://tsa.example.test' },
        certificate: {
          subject: 'CN=Signer',
          issuer: 'CN=ICP Test',
          serialNumber: '01',
        },
      }),
    ).rejects.toThrow('Document SHA-256 mismatch');
  });
});
