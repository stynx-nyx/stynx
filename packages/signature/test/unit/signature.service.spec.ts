import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import {
  HttpSignatureProviderClient,
  ProviderBackedSignatureBackend,
  SignatureCertificateValidationError,
  SignatureHashMismatchError,
  SignatureProviderResponseError,
  SignatureService,
  SignatureVerificationInputError,
  StynxSignatureModule,
  createMockSignatureBackend,
  type SignatureProviderClient,
} from '../../src';

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const certificate = {
  subject: 'CN=Signer',
  issuer: 'CN=ICP Test',
  serialNumber: '01',
  pem: '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----',
};

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
      certificate,
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
    const backend = createMockSignatureBackend();
    const sign = vi.spyOn(backend, 'sign');
    const service = new SignatureService(backend);

    await expect(
      service.sign({
        tenantId: 'tenant-a',
        actorId: 'actor-a',
        document: Buffer.from('pdf-a-bytes'),
        documentSha256: 'wrong',
        tsa: { endpoint: 'https://tsa.example.test' },
        certificate,
      }),
    ).rejects.toBeInstanceOf(SignatureHashMismatchError);
    expect(sign).not.toHaveBeenCalled();
  });

  it('requires signed bytes or CMS bytes for verification', async () => {
    const document = Buffer.from('pdf-a-bytes');
    const service = new SignatureService(createMockSignatureBackend());

    await expect(
      service.verify({
        tenantId: 'tenant-a',
        document,
        documentSha256: sha256Hex(document),
      }),
    ).rejects.toBeInstanceOf(SignatureVerificationInputError);
  });
});

describe('ProviderBackedSignatureBackend', () => {
  it('validates the certificate before delegating to provider signing', async () => {
    const now = new Date('2026-05-23T12:00:00.000Z');
    const calls: string[] = [];
    const provider: SignatureProviderClient = {
      async validateCertificate() {
        calls.push('validate');
        return { good: true, source: 'OCSP'.toLowerCase() as 'ocsp', checkedAt: now };
      },
      async signPades() {
        calls.push('sign');
        return {
          signedDocument: Buffer.from('%PDF-SIGNED'),
          cmsSignature: Buffer.from('cms'),
          tsaTime: now,
          revocationSource: 'crl',
          revocationCheckedAt: now,
        };
      },
      async verifyPades() {
        throw new Error('not used');
      },
    };
    const document = Buffer.from('%PDF');
    const service = new SignatureService(
      new ProviderBackedSignatureBackend(provider, { now: () => now }),
    );

    const result = await service.sign({
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      document,
      documentSha256: sha256Hex(document),
      tsa: { endpoint: 'https://tsa.example.test' },
      certificate,
    });

    expect(calls).toEqual(['validate', 'sign']);
    expect(result.signedDocument).toEqual(Buffer.from('%PDF-SIGNED'));
    expect(result.evidence.revocationSource).toBe('crl');
    expect(result.evidence.tsaTime?.toISOString()).toBe(now.toISOString());
  });

  it('rejects signing when certificate validation fails', async () => {
    const provider: SignatureProviderClient = {
      async validateCertificate() {
        return {
          good: false,
          source: 'ocsp',
          checkedAt: new Date('2026-05-23T12:00:00.000Z'),
          reason: 'certificate revoked',
        };
      },
      async signPades() {
        throw new Error('must not sign');
      },
      async verifyPades() {
        throw new Error('not used');
      },
    };
    const document = Buffer.from('%PDF');
    const service = new SignatureService(new ProviderBackedSignatureBackend(provider));

    await expect(
      service.sign({
        tenantId: 'tenant-a',
        actorId: 'actor-a',
        document,
        documentSha256: sha256Hex(document),
        tsa: { endpoint: 'https://tsa.example.test' },
        certificate,
      }),
    ).rejects.toBeInstanceOf(SignatureCertificateValidationError);
  });
});

describe('HttpSignatureProviderClient', () => {
  it('maps PEC-derived provider sign and verify payloads', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          good: true,
          source: 'OCSP',
          checkedAt: '2026-05-23T12:00:00.000Z',
          certificateChainPem: ['chain'],
        }),
      )
      .mockResolvedValueOnce(
        response({
          signedPdfBase64: Buffer.from('%PDF-SIGNED').toString('base64'),
          cmsSignatureBase64: Buffer.from('cms').toString('base64'),
          signatureId: 'sig-1',
          tsaTime: '2026-05-23T12:01:00.000Z',
          revocationSource: 'CRL',
          revocationCheckedAt: '2026-05-23T12:00:00.000Z',
          providerEvidenceUri: 'mock://evidence/sig-1',
        }),
      )
      .mockResolvedValueOnce(
        response({
          status: 'valid',
          checkedAt: '2026-05-23T12:02:00.000Z',
          revocationSource: 'OCSP',
          reasons: [],
        }),
      );
    const client = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      pathPrefix: '/mock',
      fetch: fetchMock,
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    const document = Buffer.from('%PDF');

    await client.validateCertificate({
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      certificate,
      allowCrlFallback: true,
      crlUrl: 'https://crl.example.test/list.crl',
    });
    const signed = await client.signPades({
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      document,
      documentSha256: sha256Hex(document),
      tsa: { endpoint: 'https://provider.example.test', policyOid: '1.2.3' },
      certificate,
      algorithm: 'pades-ltv',
      digestAlgorithm: 'sha256',
      idempotencyKey: 'idem-1',
    });
    const verified = await client.verifyPades({
      tenantId: 'tenant-a',
      document,
      documentSha256: sha256Hex(document),
      signedDocument: signed.signedDocument,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL('/mock/tsa/ocsp/validate', 'https://provider.example.test/'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"certificatePem"'),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL('/mock/tsa/sign', 'https://provider.example.test/'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(Buffer.from('%PDF').toString('base64')),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      new URL('/mock/pades/verify', 'https://provider.example.test/'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(signed.signedDocument).toEqual(Buffer.from('%PDF-SIGNED'));
    expect(signed.revocationSource).toBe('crl');
    expect(verified.status).toBe('valid');
  });

  it('deduplicates provider signing by idempotency key', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        signedPdfBase64: Buffer.from('%PDF-SIGNED').toString('base64'),
        revocationSource: 'OCSP',
      }),
    );
    const client = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: fetchMock,
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    const request = {
      tenantId: 'tenant-a',
      actorId: 'actor-a',
      document: Buffer.from('%PDF'),
      documentSha256: sha256Hex(Buffer.from('%PDF')),
      tsa: { endpoint: 'https://provider.example.test' },
      certificate,
      algorithm: 'pades-ltv' as const,
      digestAlgorithm: 'sha256' as const,
      idempotencyKey: 'same-key',
    };

    await client.signPades(request);
    await client.signPades(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed provider responses', async () => {
    const client = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({})),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });

    await expect(
      client.signPades({
        tenantId: 'tenant-a',
        actorId: 'actor-a',
        document: Buffer.from('%PDF'),
        documentSha256: sha256Hex(Buffer.from('%PDF')),
        tsa: { endpoint: 'https://provider.example.test' },
        certificate,
        algorithm: 'pades-ltv',
        digestAlgorithm: 'sha256',
      }),
    ).rejects.toBeInstanceOf(SignatureProviderResponseError);
  });
});

describe('StynxSignatureModule', () => {
  it('wires SignatureService with a configured backend', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxSignatureModule.forRoot({
          backend: createMockSignatureBackend(() => new Date('2026-05-23T12:00:00.000Z')),
        }),
      ],
    }).compile();

    expect(moduleRef.get(SignatureService)).toBeInstanceOf(SignatureService);
    await moduleRef.close();
  });
});

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}
