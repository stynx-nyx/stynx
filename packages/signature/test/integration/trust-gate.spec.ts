import 'reflect-metadata';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { X509Certificate } from '@peculiar/x509';
import * as sig from '../../src';
import {
  bltCmsSignature,
  bltSignedDocument,
  bltSourceDocument,
  bltTimestampResponse,
  bytes,
  certificate,
  cmsSignature,
  hex,
  now,
  profile,
  request,
  rootPem,
  signedDocument,
  signedResult,
  sourceDocument,
} from '../fixtures/trust';

// UPS-SIG-01 / INV-SIGNATURE-001. Resolve through the published barrel so the
// failure is an observable missing behavior, never an import-time exception.
const api = sig as Record<string, any>;
const backend = (result = signedResult()) => ({
  sign: vi.fn().mockResolvedValue(result),
  verify: vi.fn().mockResolvedValue({
    status: 'valid',
    documentSha256: hex(sourceDocument),
    checkedAt: now,
    revocationSource: 'ocsp',
    reasons: [],
  }),
});
const service = (b: object, verifier?: object) =>
  new (sig.SignatureService as any)(b, { trustVerifier: verifier, verifier });
const proof = (overrides: Record<string, unknown> = {}) => ({
  verifierKind: 'stynx-cms',
  profileId: profile.id,
  profileRevision: profile.revision,
  achievedLevel: 'ADVANCED',
  padesProfile: 'PAdES-B-LT',
  originalDocumentSha256: hex(sourceDocument),
  signedDocumentSha256: hex(signedDocument),
  cmsSha256: hex(cmsSignature),
  signerCertificateSha256: hex(bytes('signer.cert.der')),
  chainSha256: [hex(Buffer.from(rootPem))],
  signedAt: now,
  tsaAt: now,
  certificateValidatedAt: now,
  revocationSource: 'ocsp',
  verificationRef: 'proof-1',
  ...overrides,
});
const verifier = (p = proof()) => ({
  capabilities: vi.fn().mockResolvedValue({
    simulated: false,
    pades: true,
    tsa: true,
    lta: true,
    certificateValidation: ['ocsp', 'crl'],
    evidenceSource: 'signed-test',
    checkedAt: now,
  }),
  verifySignedArtifact: vi.fn().mockResolvedValue(p),
});
const expectTypedReject = async (promise: Promise<unknown>, name: string) => {
  await expect(promise).rejects.toMatchObject({ name });
};

describe('regulated sign and verify', () => {
  it('fails closed without backend, profile, or verifier', async () => {
    await expectTypedReject(
      new sig.SignatureService().sign(request as any),
      'SignatureProviderConfigurationError',
    );
    await expectTypedReject(
      service(backend()).sign({ ...request, trustProfile: undefined } as any),
      'SignatureProviderConfigurationError',
    );
    await expectTypedReject(
      service(backend()).sign(request as any),
      'SignatureProviderConfigurationError',
    );
  });

  it('passes the exact returned bytes to the verifier and does not accept a backend level claim', async () => {
    const b = backend(
      signedResult({ evidence: { ...signedResult().evidence, signatureLevel: 'QUALIFIED' } }),
    );
    const v = verifier();
    const result = await service(b, v).sign(request as any);
    expect(v.verifySignedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        originalDocument: sourceDocument,
        signedDocument,
        cmsSignature,
        certificate,
        profile,
      }),
    );
    expect(result.evidence).toMatchObject({
      signatureLevel: 'ADVANCED',
      verifierKind: 'consumer-owned',
    });
  });

  it.each([
    ['lower level', proof(), 'SignatureLevelNotMetError'],
    [
      'wrong source hash',
      proof({ originalDocumentSha256: '0'.repeat(64) }),
      'SignatureEvidenceMismatchError',
    ],
    [
      'wrong PDF hash',
      proof({ signedDocumentSha256: '0'.repeat(64) }),
      'SignatureEvidenceMismatchError',
    ],
    ['wrong CMS hash', proof({ cmsSha256: '0'.repeat(64) }), 'SignatureEvidenceMismatchError'],
    [
      'wrong certificate hash',
      proof({ signerCertificateSha256: '0'.repeat(64) }),
      'SignatureEvidenceMismatchError',
    ],
    [
      'wrong profile revision',
      proof({ profileRevision: 'other' }),
      'SignatureEvidenceMismatchError',
    ],
    ['epoch zero TSA', proof({ tsaAt: new Date(0) }), 'SignatureTrustError'],
  ])('rejects %s', async (_label, p, error) => {
    const minimum = _label === 'lower level' ? 'QUALIFIED' : 'ADVANCED';
    await expectTypedReject(
      service(backend(), verifier(p)).sign({
        ...request,
        minimumSignatureLevel: minimum,
        trustProfile: { ...profile, minimumSignatureLevel: minimum },
      } as any),
      error,
    );
  });

  it.each([
    ['missing signed PDF', signedResult({ signedDocument: new Uint8Array() })],
    ['missing CMS', signedResult({ cmsSignature: new Uint8Array() })],
    ['mock CMS', signedResult({ cmsSignature: Buffer.from('mock-cms:fake') })],
    ['synthetic PAdES', signedResult({ cmsSignature: Buffer.from('pades:fake') })],
    [
      'wrong receipt hash',
      signedResult({ evidence: { ...signedResult().evidence, documentSha256: '0'.repeat(64) } }),
    ],
    ['missing TSA', signedResult({ evidence: { ...signedResult().evidence, tsaTime: undefined } })],
    [
      'epoch zero',
      signedResult({ evidence: { ...signedResult().evidence, signedAt: new Date(0) } }),
    ],
  ])('rejects provider %s before a signed result', async (_label, result) => {
    await expect(service(backend(result), verifier()).sign(request as any)).rejects.toBeInstanceOf(
      sig.SignatureError,
    );
  });

  it.each([
    [
      'malformed artifact hash',
      signedResult({
        evidence: {
          ...signedResult().evidence,
          documentSha256: 'not-a-sha256',
        },
      }),
      'SignatureEvidenceMismatchError',
    ],
    [
      'wrong artifact format',
      signedResult({ signedDocument: Buffer.from('<xml/>') }),
      'SignatureTrustError',
    ],
    [
      'missing CMS payload',
      signedResult({ cmsSignature: undefined }),
      'SignatureProviderResponseError',
    ],
    [
      'missing TSA time',
      signedResult({
        evidence: {
          ...signedResult().evidence,
          tsaTime: undefined,
        },
      }),
      'SignatureTrustError',
    ],
  ])('maps clinical and junta negative %s to a typed error', async (_case, result, error) => {
    await expectTypedReject(service(backend(result), verifier()).sign(request as any), error);
  });

  it('rejects mock backend for a production profile', async () => {
    await expect(
      service(sig.createMockSignatureBackend(), verifier()).sign({
        ...request,
        trustProfile: { ...profile, environment: 'production' },
      } as any),
    ).rejects.toBeInstanceOf(sig.SignatureError);
  });

  it('does not return valid when regulated verification has missing local bytes or unavailable proof', async () => {
    await expectTypedReject(
      service(backend(), verifier()).verify({
        tenantId: 'tenant-a',
        document: sourceDocument,
        documentSha256: hex(sourceDocument),
        minimumSignatureLevel: 'ADVANCED',
        trustProfile: profile,
      } as any),
      'SignatureVerificationInputError',
    );
    const v = verifier();
    v.verifySignedArtifact.mockRejectedValue(new Error('OCSP unavailable'));
    const outcome = await service(backend(), v).verify({
      tenantId: 'tenant-a',
      document: sourceDocument,
      documentSha256: hex(sourceDocument),
      signedDocument,
      cmsSignature,
      minimumSignatureLevel: 'ADVANCED',
      trustProfile: profile,
    } as any);
    expect(outcome.status).toBe('unknown');
  });

  it.each([
    [
      'HTTP failure',
      vi.fn<typeof fetch>().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: 'unavailable' }),
      } as Response),
    ],
    [
      'timeout',
      vi.fn<typeof fetch>().mockRejectedValue(new DOMException('deadline', 'AbortError')),
    ],
  ])('preserves a typed provider error for %s', async (_case, fetch) => {
    const client = new sig.HttpSignatureProviderClient({
      baseUrl: 'https://provider.example.test',
      fetch,
      retryPolicy: { maxAttempts: 1, baseDelayMs: 0 },
      timeoutMs: 20,
    });
    await expect(
      client.validateCertificate({
        tenantId: 'tenant-a',
        actorId: 'doctor-a',
        certificate,
        allowCrlFallback: false,
      }),
    ).rejects.toBeInstanceOf(sig.SignatureProviderError);
  });

  it('rejects absent provider configuration rather than inventing a token or result', async () => {
    const b = new sig.ProviderBackedSignatureBackend({
      validateCertificate: async () => {
        throw new sig.SignatureProviderConfigurationError('token absent');
      },
      signPades: async () => {
        throw new Error('must not sign');
      },
      verifyPades: async () => {
        throw new Error('must not verify');
      },
    });
    await expectTypedReject(
      service(b, verifier()).sign(request as any),
      'SignatureProviderConfigurationError',
    );
  });
});

describe('production verifier ownership', () => {
  it.each([
    ['unbranded', {}],
    ['forged structural marker', { verifierKind: 'stynx-cms' }],
  ])('refuses %s custom verifier without explicit acknowledgement', async (_label, extra) => {
    const custom = { ...verifier(), ...extra };
    await expect(
      (await import('@nestjs/testing')).Test.createTestingModule({
        imports: [
          sig.StynxSignatureModule.forRoot({
            backend: backend(),
            trustProfile: { ...profile, environment: 'production' },
            verifier: custom,
          } as any),
        ],
      })
        .compile()
        .then(async (moduleRef) => {
          try {
            await moduleRef.init();
          } finally {
            await moduleRef.close();
          }
        }),
    ).rejects.toMatchObject({ name: 'SignatureProviderConfigurationError' });
  });

  it('records acknowledged custom verification as consumer-owned, not STYNX-owned', async () => {
    const custom = verifier(proof({ verifierKind: 'stynx-cms' }));
    const moduleRef = await (
      await import('@nestjs/testing')
    ).Test.createTestingModule({
      imports: [
        sig.StynxSignatureModule.forRoot({
          backend: backend(),
          trustProfile: profile,
          verifier: custom,
          consumerOwnedVerifier: { acknowledged: true },
        } as any),
      ],
    }).compile();
    try {
      const result = await moduleRef.get(sig.SignatureService).sign(request as any);
      expect(result.evidence.verifierKind).toBe('consumer-owned');
      expect(result.evidence.trustProof.verifierKind).toBe('consumer-owned');
    } finally {
      await moduleRef.close();
    }
  });
});

describe('concrete STYNX CMS verifier', () => {
  it('uses a parseable real PKI fixture rather than provider JSON', () => {
    const signerDer = bytes('signer.cert.der');
    const parsed = asn1js.fromBER(
      signerDer.buffer.slice(signerDer.byteOffset, signerDer.byteOffset + signerDer.byteLength),
    );
    expect(parsed.offset).toBeGreaterThan(0);
    const pkijsCertificate = new pkijs.Certificate({ schema: parsed.result });
    expect(pkijsCertificate.serialNumber.valueBlock.valueHexView.length).toBeGreaterThan(0);
    const x509 = new X509Certificate(signerDer);
    expect(x509.subject).toContain('STYNX Test Signer');
  });

  it('has embedded B-LT evidence and a signed source prefix', () => {
    const pdf = Buffer.from(bltSignedDocument);
    const source = Buffer.from(bltSourceDocument);
    expect(pdf.subarray(0, source.length).equals(source)).toBe(true);
    expect(pdf.toString('latin1')).toContain('/SubFilter /ETSI.CAdES.detached');
    expect(pdf.toString('latin1')).toContain('/DSS 8 0 R');
    expect(pdf.toString('latin1')).toContain('/VRI <<');
    const cms = Buffer.from(bltCmsSignature);
    const parsed = asn1js.fromBER(cms.buffer.slice(
      cms.byteOffset,
      cms.byteOffset + cms.byteLength,
    ));
    const data = new pkijs.SignedData({ schema: new pkijs.ContentInfo({ schema: parsed.result }).content });
    expect(data.signerInfos[0]?.signedAttrs?.attributes.some(
      (attr) => attr.type === '1.2.840.113549.1.9.16.2.47',
    )).toBe(true);
    expect(data.signerInfos[0]?.unsignedAttrs?.attributes.some(
      (attr) => attr.type === '1.2.840.113549.1.9.16.2.14',
    )).toBe(true);
  });

  const create = (overrides: Record<string, unknown> = {}) => {
    expect(api.createCmsTrustVerifier).toEqual(expect.any(Function));
    return api.createCmsTrustVerifier({
      trustAnchorsPem: [rootPem],
      acceptedPolicies: profile.acceptedPolicies,
      tsaTrustAnchorsPem: [rootPem],
      now: () => now,
      fetchOcsp: async () => bytes('ocsp-good.der'),
      fetchCrl: async () => bytes('root.crl.der'),
      fetchTsa: async () => bltTimestampResponse,
      ...overrides,
    });
  };
  const input = () => ({
    tenantId: 'tenant-a',
    originalDocument: bltSourceDocument,
    signedDocument: bltSignedDocument,
    cmsSignature: bltCmsSignature,
    certificate,
    profile,
  });

  it('verifies fixture CMS over the PDF ByteRange, signer chain, policy, TSA and revocation', async () => {
    const result = await create().verifySignedArtifact(input());
    expect(result).toMatchObject({
      verifierKind: 'stynx-cms',
      originalDocumentSha256: hex(bltSourceDocument),
      signedDocumentSha256: hex(bltSignedDocument),
      cmsSha256: hex(bltCmsSignature),
      signerCertificateSha256: hex(bytes('signer.cert.der')),
      achievedLevel: 'ADVANCED',
      padesProfile: 'PAdES-B-LT',
    });
    expect(result.tsaAt.getTime()).toBeGreaterThan(0);
    expect(result.revocationSource).toMatch(/^(ocsp|crl)$/);
  });

  it.each([
    ['PDF ByteRange contents', { signedDocument: Buffer.from(bltSignedDocument).fill(0, 40, 45) }],
    ['detached CMS', { cmsSignature: Buffer.from(bltCmsSignature).fill(0, 20, 30) }],
    ['wrong signer certificate', { certificate: { ...certificate, pem: rootPem } }],
    ['untrusted chain', { profile: { ...profile, trustAnchorsPem: [] } }],
    ['wrong policy OID', { profile: { ...profile, acceptedPolicies: ['9.9.9'] } }],
  ])('rejects %s cryptographically', async (_label, change) => {
    await expect(create().verifySignedArtifact({ ...input(), ...change })).rejects.toBeInstanceOf(
      sig.SignatureError,
    );
  });

  it('rejects a B-T detached CMS that claims the B-LT profile', async () => {
    await expect(create({ fetchTsa: async () => bytes('timestamp.tsr') }).verifySignedArtifact({
      ...input(),
      originalDocument: sourceDocument,
      signedDocument,
      cmsSignature,
    })).rejects.toBeInstanceOf(sig.SignatureError);
  });

  it.each([
    ['B-B', 'pades-bb'],
    ['B-T', 'pades-bt'],
  ])('rejects real %s bytes relabelled B-LT by a provider', async (_label, stem) => {
    const pdf = bytes(`${stem}-blt.pdf`);
    const cms = bytes(`${stem}-blt.cms.der`);
    const source = bytes(`${stem}-source.pdf`);
    await expect(create({ fetchTsa: async () => bytes(`${stem}-blt-timestamp.tsr`) })
      .verifySignedArtifact({
        ...input(),
        originalDocument: source,
        signedDocument: pdf,
        cmsSignature: cms,
      })).rejects.toBeInstanceOf(sig.SignatureError);
  });

  it('rejects an external timestamp even when the token itself is signed', async () => {
    await expect(create({ fetchTsa: async () => bltTimestampResponse }).verifySignedArtifact({
      ...input(),
      originalDocument: sourceDocument,
      signedDocument,
      cmsSignature,
    })).rejects.toBeInstanceOf(sig.SignatureError);
  });

  it('rejects an unrelated original document even when the PDF and CMS are valid', async () => {
    await expect(create().verifySignedArtifact({
      ...input(),
      originalDocument: Buffer.from('unrelated PDF source'),
    })).rejects.toBeInstanceOf(sig.SignatureError);
  });

  it('rejects nonzero CMS placeholder padding outside the ByteRange', async () => {
    const pdf = Buffer.from(bltSignedDocument);
    const contentHex = pdf.indexOf(Buffer.from('/Contents <')) + '/Contents <'.length;
    const padding = contentHex + bltCmsSignature.length * 2;
    expect(pdf[padding]).toBe('0'.charCodeAt(0));
    pdf[padding] = '1'.charCodeAt(0);
    await expect(create().verifySignedArtifact({
      ...input(),
      signedDocument: pdf,
    })).rejects.toBeInstanceOf(sig.SignatureError);
  });

  it('rejects a manifest hash that is absent from CMS signed attributes', async () => {
    await expect(
      create().verifySignedArtifact({
        ...input(),
        expectedManifestSha256: 'a'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(sig.SignatureError);
  });

  it.each([
    ['revoked OCSP', { fetchOcsp: async () => bytes('ocsp-revoked.der') }, profile],
    [
      'unknown OCSP',
      { fetchOcsp: async () => bytes('ocsp-unknown.der') },
      { ...profile, revocation: 'ocsp' },
    ],
    [
      'revoked CRL',
      { fetchCrl: async () => bytes('revoked.crl.der') },
      { ...profile, revocation: 'crl' },
    ],
    ['absent TSA', { fetchTsa: async () => undefined }, profile],
    ['unsigned TSA', { fetchTsa: async () => Buffer.from('not-a-token') }, profile],
  ])('rejects %s from signed PKI evidence', async (_name, fetchers, selected) => {
    await expect(
      create(fetchers).verifySignedArtifact({
        ...input(),
        profile: selected,
      }),
    ).rejects.toBeInstanceOf(sig.SignatureError);
  });

  it('permits CRL-only and OCSP-or-CRL fallback when the configured proof is signed and fresh', async () => {
    const crlOnly = await create({ fetchOcsp: async () => undefined }).verifySignedArtifact({
      ...input(),
      profile: { ...profile, revocation: 'crl' },
    });
    expect(crlOnly.revocationSource).toBe('crl');
    const fallback = await create({ fetchOcsp: async () => undefined }).verifySignedArtifact(
      input(),
    );
    expect(fallback.revocationSource).toBe('crl');
  });

  it('keeps existing no-minimum mock signing and verification', async () => {
    const s = new sig.SignatureService(sig.createMockSignatureBackend(() => now));
    const legacy = { ...request, minimumSignatureLevel: undefined, trustProfile: undefined } as any;
    const result = await s.sign(legacy);
    expect(result.status).toBe('signed');
    expect(result.evidence.signatureLevel).toBeUndefined();
    const checked = await s.verify({
      tenantId: 'tenant-a',
      document: sourceDocument,
      documentSha256: hex(sourceDocument),
      cmsSignature: result.cmsSignature,
    });
    expect(checked.status).toBe('valid');
  });

  it('classifies unavailable TSA as unknown and a broken signed PDF as invalid', async () => {
    const verifyRequest = {
      tenantId: 'tenant-a',
      document: bltSourceDocument,
      documentSha256: hex(bltSourceDocument),
      signedDocument: bltSignedDocument,
      cmsSignature: bltCmsSignature,
      certificate,
      minimumSignatureLevel: 'ADVANCED',
      trustProfile: profile,
    } as const;
    const unavailable = await service(backend(), create({ fetchTsa: async () => undefined }))
      .verify(verifyRequest as any);
    expect(unavailable.status).toBe('unknown');
    const invalid = await service(backend(), create()).verify({
      ...verifyRequest,
      signedDocument: Buffer.from(bltSignedDocument).fill(0, 40, 45),
    } as any);
    expect(invalid.status).toBe('invalid');
  });

  it('enforces a QUALIFIED profile even when the request asks for ADVANCED', async () => {
    const result = signedResult({
      signedDocument: bltSignedDocument,
      cmsSignature: bltCmsSignature,
      evidence: { ...signedResult().evidence, documentSha256: hex(bltSourceDocument) },
    });
    await expect(service(backend(result), create()).sign({
      ...request,
      document: bltSourceDocument,
      documentSha256: hex(bltSourceDocument),
      minimumSignatureLevel: 'ADVANCED',
      trustProfile: { ...profile, minimumSignatureLevel: 'QUALIFIED' },
    } as any)).rejects.toMatchObject({ name: 'SignatureLevelNotMetError' });
  });
});
