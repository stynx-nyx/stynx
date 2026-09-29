import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import {
  HttpSignatureProviderClient,
  ProviderBackedSignatureBackend,
  SignatureCertificateValidationError,
  SignatureHashMismatchError,
  SignatureProviderResponseError,
  SignatureProviderConfigurationError,
  SignatureService,
  SignatureVerificationInputError,
  StynxSignatureModule,
  createMockSignatureBackend,
  sha256Hex as exportedSha256Hex,
  type SignatureProviderClient,
} from '../../src';
import { profile } from '../fixtures/trust';

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
  it('uses the default clock in the mock backend when no clock is supplied', async () => {
    const backend = createMockSignatureBackend();
    const document = Buffer.from('%PDF');
    const result = await backend.sign({
      tenantId: 'tenant-a', actorId: 'actor-a', document,
      documentSha256: exportedSha256Hex(document),
      tsa: { endpoint: 'https://tsa.example.test' }, certificate,
    });
    expect(result.evidence.signedAt).toBeInstanceOf(Date);
    expect(await backend.verify({
      tenantId: 'tenant-a', document, documentSha256: exportedSha256Hex(document),
    })).toMatchObject({ status: 'unknown', revocationSource: 'ocsp' });
    expect(await backend.verify({
      tenantId: 'tenant-a', document, documentSha256: exportedSha256Hex(document),
      cmsSignature: Buffer.from('cms'), policy: { requireRevocationEvidence: false },
    })).toMatchObject({ status: 'valid', revocationSource: 'none' });
  });

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

  it('uses the explicit missing-backend verification failure', async () => {
    const document = Buffer.from('%PDF');
    await expect(new SignatureService().verify({
      tenantId: 'tenant-a', document, documentSha256: sha256Hex(document),
      cmsSignature: Buffer.from('cms'),
    })).rejects.toBeInstanceOf(SignatureProviderConfigurationError);
  });

  it('uses the explicit missing-backend signing failure', async () => {
    const document = Buffer.from('%PDF');
    await expect(new SignatureService().sign({
      tenantId: 'tenant-a', actorId: 'actor-a', document,
      documentSha256: sha256Hex(document), tsa: { endpoint: 'https://tsa.example.test' }, certificate,
    })).rejects.toBeInstanceOf(SignatureProviderConfigurationError);
  });

  it('fails readiness when the verifier does not answer before the capability deadline', async () => {
    vi.useFakeTimers();
    try {
      const verifier = { capabilities: vi.fn(() => new Promise<never>(() => {})),
        verifySignedArtifact: vi.fn() };
      const service = new (SignatureService as any)(createMockSignatureBackend(), { verifier });
      const pending = service.checkReadiness({
        id: 'timeout', revision: '1', environment: 'test', minimumSignatureLevel: 'ADVANCED',
        requiredPadesProfile: 'PAdES-B-T', requireTsa: true, requireLta: false,
        revocation: 'ocsp', trustAnchorsPem: [],
      });
      const rejection = expect(pending).rejects.toMatchObject({ name: 'SignatureCapabilityError' });
      await vi.advanceTimersByTimeAsync(5000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails readiness closed for missing, malformed, rejected and simulated observations', async () => {
    const backend = { sign: vi.fn(), verify: vi.fn() };
    await expect(new (SignatureService as any)(backend).checkReadiness(profile))
      .rejects.toMatchObject({ name: 'SignatureProviderConfigurationError' });
    for (const capabilities of [
      vi.fn().mockRejectedValue(new Error('probe unavailable')),
      vi.fn().mockResolvedValue(null),
      vi.fn().mockResolvedValue({ certificateValidation: 'ocsp' }),
      vi.fn().mockResolvedValue({ simulated: true, pades: true, tsa: true, lta: true,
        certificateValidation: ['ocsp'], checkedAt: new Date() }),
    ]) {
      const verifier = { capabilities, verifySignedArtifact: vi.fn() };
      await expect(new (SignatureService as any)(backend, { verifier,
        consumerOwnedVerifier: { acknowledged: true } }).checkReadiness({
        ...profile, environment: 'production',
      })).rejects.toMatchObject({ name: 'SignatureCapabilityError' });
    }
  });
});

describe('ProviderBackedSignatureBackend', () => {
  it('maps validated provider metadata while requiring trusted evidence for regulated signing', async () => {
    const now = new Date('2026-05-23T12:00:00.000Z');
    const provider: SignatureProviderClient = {
      async validateCertificate() {
        return {
          good: true,
          source: 'ocsp',
          checkedAt: now,
          certificateChainPem: ['validated-chain'],
          providerEvidenceUri: 'https://provider.example.test/validation',
        };
      },
      async signPades() {
        return { signedDocument: Buffer.from('%PDF-SIGNED'), cmsSignature: Buffer.from('cms'),
          signedAt: now, tsaTime: now, revocationSource: 'none' };
      },
      async verifyPades() {
        return { status: 'unknown', documentSha256: 'hash', checkedAt: now,
          revocationSource: 'none', reasons: [] };
      },
    };
    const backend = new ProviderBackedSignatureBackend(provider, { now: () => now });
    const document = Buffer.from('%PDF');
    const result = await backend.sign({
      tenantId: 'tenant-a', actorId: 'actor-a', document,
      documentSha256: sha256Hex(document), tsa: { endpoint: 'https://tsa.example.test' },
      certificate, minimumSignatureLevel: 'ADVANCED',
    });
    expect(result).toMatchObject({ status: 'signed', cmsSignature: Buffer.from('cms') });
    expect(result.evidence).toMatchObject({
      signedAt: now,
      tsaTime: now,
      certificateChainPem: ['validated-chain'],
      revocationSource: 'ocsp',
      revocationCheckedAt: now,
      providerEvidenceUri: 'https://provider.example.test/validation',
    });

    const incompleteProvider: SignatureProviderClient = {
      ...provider,
      async signPades() { return { signedDocument: Buffer.from('%PDF-SIGNED') }; },
    };
    await expect(new ProviderBackedSignatureBackend(incompleteProvider).sign({
      tenantId: 'tenant-a', actorId: 'actor-a', document,
      documentSha256: sha256Hex(document), tsa: { endpoint: 'https://tsa.example.test' },
      certificate, minimumSignatureLevel: 'ADVANCED',
    })).rejects.toBeInstanceOf(SignatureProviderResponseError);
  });

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

  it('uses the injected fallback clock and merges verification policies', async () => {
    const now = new Date('2026-05-23T12:00:00.000Z');
    const verifyPades = vi.fn<SignatureProviderClient['verifyPades']>(async (request) => ({
      status: 'valid',
      documentSha256: request.documentSha256,
      checkedAt: now,
      revocationSource: 'none',
      reasons: [],
    }));
    const provider: SignatureProviderClient = {
      async validateCertificate() {
        return { good: true, source: 'crl', checkedAt: now };
      },
      async signPades() {
        return { signedDocument: Buffer.from('%PDF-SIGNED'), revocationSource: 'none' };
      },
      verifyPades,
    };
    const backend = new ProviderBackedSignatureBackend(provider, {
      verificationPolicy: { requireRevocationEvidence: true },
      now: () => now,
    });
    const document = Buffer.from('%PDF');
    const request = {
      tenantId: 'tenant-a', actorId: 'actor-a', document,
      documentSha256: sha256Hex(document), tsa: { endpoint: 'https://tsa.example.test' }, certificate,
    };
    const signed = await backend.sign(request);
    expect(signed.evidence.signedAt).toBe(now);
    expect(signed.evidence.revocationSource).toBe('crl');
    expect(signed.cmsSignature).toEqual(Buffer.from(`pades:${signed.evidence.signatureId}`));
    await backend.verify({
      tenantId: 'tenant-a', document, documentSha256: sha256Hex(document),
      policy: { requireRevocationEvidence: false },
    });
    expect(verifyPades).toHaveBeenCalledWith(expect.objectContaining({
      policy: { requireRevocationEvidence: false },
    }));

    const noPolicy = new ProviderBackedSignatureBackend(provider);
    await noPolicy.verify({
      tenantId: 'tenant-a', document, documentSha256: sha256Hex(document),
    });
    expect(verifyPades).toHaveBeenLastCalledWith(expect.objectContaining({ policy: {} }));
  });

  it('uses the system clock when a provider omits all signing times', async () => {
    const provider: SignatureProviderClient = {
      async validateCertificate() {
        return { good: true, source: 'ocsp', checkedAt: new Date() };
      },
      async signPades() { return { signedDocument: Buffer.from('%PDF-SIGNED') }; },
      async verifyPades() {
        return { status: 'unknown', documentSha256: 'hash', checkedAt: new Date(),
          revocationSource: 'none', reasons: [] };
      },
    };
    const document = Buffer.from('%PDF');
    const result = await new ProviderBackedSignatureBackend(provider).sign({
      tenantId: 'tenant-a', actorId: 'actor-a', document,
      documentSha256: sha256Hex(document), tsa: { endpoint: 'https://tsa.example.test' }, certificate,
    });
    expect(result.evidence.signedAt).toBeInstanceOf(Date);
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

  it('maps optional provider fields and applies normalized URL and header defaults', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ good: false, source: 'NONE' }))
      .mockResolvedValueOnce(response({ signedPdfBase64: Buffer.from('%PDF').toString('base64') }))
      .mockResolvedValueOnce(response({ status: 'unknown' }));
    const client = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      pathPrefix: 'service/',
      headers: { 'x-default': 'default', 'x-overridden': 'default' },
      fetch: fetchMock,
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    const validation = await client.validateCertificate({
      tenantId: 'tenant-a', actorId: 'actor-a', certificate, allowCrlFallback: false,
    });
    const signed = await client.signPades({
      tenantId: 'tenant-a', actorId: 'actor-a', document: Buffer.from('%PDF'),
      documentSha256: sha256Hex(Buffer.from('%PDF')),
      tsa: { endpoint: '', headers: { 'x-overridden': 'request' } }, certificate,
      algorithm: 'pades-ltv', digestAlgorithm: 'sha256',
    });
    const verified = await client.verifyPades({
      tenantId: 'tenant-a', document: Buffer.from('%PDF'),
      documentSha256: sha256Hex(Buffer.from('%PDF')),
    });

    expect(validation).toMatchObject({ good: false, source: 'none' });
    expect(validation.checkedAt).toBeInstanceOf(Date);
    expect(signed).toMatchObject({ signedDocument: Buffer.from('%PDF'), revocationSource: 'none' });
    expect(verified).toMatchObject({ status: 'unknown', revocationSource: 'none', reasons: [] });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      new URL('/service/tsa/ocsp/validate', 'https://provider.example.test/'),
      expect.objectContaining({
        headers: { 'content-type': 'application/json', 'x-default': 'default', 'x-overridden': 'default' },
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL('/service/tsa/sign', 'https://provider.example.test/'),
      expect.objectContaining({
        headers: { 'content-type': 'application/json', 'x-default': 'default', 'x-overridden': 'request' },
      }),
    );
  });

  it('maps the remaining provider evidence fields and accepts dated certificates', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({
        good: true, source: 'EMBEDDED', reason: 'checked', providerEvidenceUri: 'evidence://cert',
      }))
      .mockResolvedValueOnce(response({
        signedPdfBase64: Buffer.from('%PDF').toString('base64'),
        cmsSignatureBase64: Buffer.from('cms').toString('base64'),
        signatureId: 'sig-full',
        signedAt: '2026-05-23T12:00:00.000Z',
        tsaTime: '2026-05-23T12:01:00.000Z',
        certificateChainPem: ['chain'],
        revocationSource: 'NONE',
        revocationCheckedAt: '2026-05-23T12:02:00.000Z',
        providerEvidenceUri: 'evidence://signature',
      }))
      .mockResolvedValueOnce(response({
        status: 'invalid',
        signerCertificate: certificate,
        revocationSource: 'EMBEDDED',
        revocationCheckedAt: '2026-05-23T12:03:00.000Z',
        certificateChainPem: ['chain'],
        reasons: ['bad signature'],
      }));
    const client = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test/',
      pathPrefix: '',
      crlUrl: 'https://crl.example.test/list.crl',
      fetch: fetchMock,
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    const datedCertificate = {
      ...certificate,
      notBefore: new Date('2026-01-01T00:00:00.000Z'),
      notAfter: new Date('2027-01-01T00:00:00.000Z'),
    };
    const validation = await client.validateCertificate({
      tenantId: 'tenant-a', actorId: 'actor-a', certificate: datedCertificate,
      allowCrlFallback: true,
    });
    const signed = await client.signPades({
      tenantId: 'tenant-a', actorId: 'actor-a', document: Buffer.from('%PDF'),
      documentSha256: sha256Hex(Buffer.from('%PDF')),
      tsa: { endpoint: 'https://provider.example.test/' }, certificate: datedCertificate,
      algorithm: 'pades-ltv', digestAlgorithm: 'sha256',
    });
    const verified = await client.verifyPades({
      tenantId: 'tenant-a', document: Buffer.from('%PDF'),
      documentSha256: sha256Hex(Buffer.from('%PDF')),
      signedDocument: Buffer.from('%PDF-SIGNED'), cmsSignature: Buffer.from('cms'),
    });

    expect(validation).toMatchObject({
      source: 'embedded', reason: 'checked', providerEvidenceUri: 'evidence://cert',
    });
    expect(signed).toMatchObject({
      signatureId: 'sig-full', cmsSignature: Buffer.from('cms'),
      signedAt: expect.any(Date), tsaTime: expect.any(Date),
      revocationSource: 'none', providerEvidenceUri: 'evidence://signature',
    });
    expect(verified).toMatchObject({
      status: 'invalid', signerCertificate: certificate, revocationSource: 'embedded',
      reasons: ['bad signature'], certificateChainPem: ['chain'],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('/tsa/ocsp/validate', 'https://provider.example.test/'),
      expect.objectContaining({ body: expect.stringContaining('https://crl.example.test/list.crl') }),
    );
  });

  it('rejects missing configuration, non-success HTTP responses and invalid validation data', async () => {
    const noBase = new HttpSignatureProviderClient({
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({})),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    await expect(noBase.validateCertificate({
      tenantId: 'tenant-a', actorId: 'actor-a', certificate, allowCrlFallback: false,
    })).rejects.toThrow(/base URL is required/u);

    const httpFailure = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({}, 503, false)),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    await expect(httpFailure.verifyPades({
      tenantId: 'tenant-a', document: Buffer.from('%PDF'), documentSha256: 'hash',
    })).rejects.toThrow(/HTTP 503/u);

    const invalidShape = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ good: 'yes', source: 'UNKNOWN' })),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    await expect(invalidShape.validateCertificate({
      tenantId: 'tenant-a', actorId: 'actor-a', certificate, allowCrlFallback: false,
    })).rejects.toBeInstanceOf(SignatureProviderResponseError);

    const invalidSource = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ good: true, source: 'UNKNOWN' })),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    await expect(invalidSource.validateCertificate({
      tenantId: 'tenant-a', actorId: 'actor-a', certificate, allowCrlFallback: false,
    })).rejects.toThrow(/source must be OCSP, CRL, EMBEDDED, or NONE/u);
  });

  it('rejects invalid provider dates and verification status values', async () => {
    const invalidDate = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({
        good: true, source: 'OCSP', checkedAt: 'not a date',
      })),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    await expect(invalidDate.validateCertificate({
      tenantId: 'tenant-a', actorId: 'actor-a', certificate, allowCrlFallback: false,
    })).rejects.toThrow(/checkedAt is not a valid date/u);

    const invalidStatus = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: vi.fn<typeof fetch>().mockResolvedValue(response({ status: 'signed' })),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    await expect(invalidStatus.verifyPades({
      tenantId: 'tenant-a', document: Buffer.from('%PDF'), documentSha256: 'hash',
    })).rejects.toThrow(/status must be valid, invalid, or unknown/u);
  });

  it('supports adapter telemetry, the global fetch default and non-Error response failures', async () => {
    const originalFetch = globalThis.fetch;
    const globalFetch = vi.fn<typeof fetch>().mockResolvedValue(response({ good: true, source: 'CRL' }));
    vi.stubGlobal('fetch', globalFetch);
    try {
      const client = new HttpSignatureProviderClient({
        baseUrl: 'https://provider.example.test/',
        telemetry: { emit: vi.fn() } as never,
        retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
      });
      await client.validateCertificate({
        tenantId: 'tenant-a', actorId: 'actor-a', certificate, allowCrlFallback: true,
      });
      expect(globalFetch).toHaveBeenCalledWith(
        new URL('/mock/tsa/ocsp/validate', 'https://provider.example.test/'),
        expect.any(Object),
      );
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }

    const badJson = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: vi.fn<typeof fetch>().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => Promise.reject('wire failure'),
      } as Response),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    await expect(badJson.validateCertificate({
      tenantId: 'tenant-a', actorId: 'actor-a', certificate, allowCrlFallback: false,
    })).rejects.toThrow(/wire failure/u);

    const nonErrorFetch = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch: vi.fn<typeof fetch>().mockRejectedValue('transport failed without Error object'),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    await expect(nonErrorFetch.validateCertificate({
      tenantId: 'tenant-a', actorId: 'actor-a', certificate, allowCrlFallback: false,
    })).rejects.toThrow(/transport failed without Error object/u);

    const nonErrorCircuit = new HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
    });
    vi.spyOn((nonErrorCircuit as any).adapter.circuitBreaker, 'beforeRequest')
      .mockRejectedValue('circuit breaker rejected without Error object');
    await expect(nonErrorCircuit.validateCertificate({
      tenantId: 'tenant-a', actorId: 'actor-a', certificate, allowCrlFallback: false,
    })).rejects.toThrow(/circuit breaker rejected without Error object/u);
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

function response(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}
