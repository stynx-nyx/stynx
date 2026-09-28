import * as sig from '../../src';
import {
  bltCmsSignature,
  bltSignedDocument,
  bltSourceDocument,
  bytes,
  certificate,
  cmsSignature,
  hex,
  now,
  profile,
  rootPem,
  signedDocument,
  sourceDocument,
} from '../fixtures/trust';

// UPS-SIG-04 / INV-SIGNATURE-001. The physical attestor is an authenticated
// input, while the digital path must call the STYNX cryptographic verifier.
const api = sig as Record<string, any>;
const evidenceBytes = bytes('attestation.cms.der');
const declarationDocument = bytes('withdrawal-source.pdf');
const declarationSignedDocument = bytes('withdrawal-blt.pdf');
const declarationCmsSignature = bytes('withdrawal-blt.cms.der');
const base = {
  tenantId: 'tenant-a',
  caseId: 'case-a',
  documentId: 'document-a',
  document: sourceDocument,
  contentHash: hex(sourceDocument),
  eligiblePartyIds: ['party-a'],
  evidenceBytes,
  evidenceRef: 'attestation-a',
  trustProfile: profile,
};
const valid = {
  tenantId: base.tenantId,
  caseId: base.caseId,
  documentId: base.documentId,
  contentHash: base.contentHash,
  signerPartyId: 'party-a',
  verificationMethod: 'physical_verified',
  evidenceRef: base.evidenceRef,
  verifiedAt: now,
  proofRef: 'attestor-proof-a',
};
const make = (physical = valid) => {
  expect(api.SignatureWithdrawalVerifier).toEqual(expect.any(Function));
  const attestor = { verifyAttestation: vi.fn().mockResolvedValue(physical) };
  const trustVerifier = {
    verifySignedArtifact: vi.fn().mockResolvedValue({
      verifierKind: 'stynx-cms',
      profileId: profile.id,
      profileRevision: profile.revision,
      achievedLevel: 'ADVANCED',
      signedDocumentSha256: hex(signedDocument),
      cmsSha256: hex(cmsSignature),
      originalDocumentSha256: hex(sourceDocument),
      signedAt: now,
      tsaAt: now,
      verificationRef: 'cms-proof-a',
    }),
  };
  return {
    verifier: new api.SignatureWithdrawalVerifier({
      attestor,
      trustVerifier,
      resolvePartyCertificate: async () => hex(bytes('signer.cert.der')),
    }),
    attestor,
    trustVerifier,
  };
};
const assertValidReceipt = (result: any, method: string, verifiedAt = now) => {
  expect(result.status).toBe('valid');
  expect(result.evidence).toMatchObject({
    tenantId: 'tenant-a',
    caseId: 'case-a',
    documentId: 'document-a',
    contentHash: hex(sourceDocument),
    signerPartyId: 'party-a',
    verificationMethod: method,
    evidenceRef: 'attestation-a',
    verifiedAt,
    proofRef: expect.any(String),
  });
  expect(result.evidence.verifiedHashes).toBeDefined();
};

describe('withdrawal evidence', () => {
  it('preserves every consumer receipt field after a trusted physical attestation', async () => {
    const { verifier, attestor } = make();
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'physical_verified',
      signerPartyId: 'party-a',
    });
    expect(attestor.verifyAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        caseId: 'case-a',
        documentId: 'document-a',
        contentHash: hex(sourceDocument),
        signerPartyId: 'party-a',
      }),
    );
    assertValidReceipt(result, 'physical_verified');
  });

  it('preserves receipt fields only after verifying the digital signature', async () => {
    expect(api.SignatureWithdrawalVerifier).toEqual(expect.any(Function));
    expect(api.createCmsTrustVerifier).toEqual(expect.any(Function));
    const trustVerifier = api.createCmsTrustVerifier({
      trustAnchorsPem: [rootPem],
      tsaTrustAnchorsPem: [rootPem],
      acceptedPolicies: profile.acceptedPolicies,
      now: () => now,
      fetchOcsp: async () => bytes('ocsp-good.der'),
      fetchCrl: async () => bytes('root.crl.der'),
      fetchTsa: async () => bytes('withdrawal-blt-timestamp.tsr'),
    });
    const verifySignedArtifact = vi.spyOn(trustVerifier, 'verifySignedArtifact');
    const resolvePartyCertificate = vi.fn().mockResolvedValue(hex(bytes('signer.cert.der')));
    const verifier = new api.SignatureWithdrawalVerifier({ trustVerifier, resolvePartyCertificate });
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'digital_verified',
      signerPartyId: 'party-a',
      evidenceBytes: declarationCmsSignature,
      declarationDocument,
      declarationSignedDocument,
      declarationCmsSignature,
      declarationCertificate: certificate,
    });
    expect(verifySignedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        originalDocument: declarationDocument,
        signedDocument: declarationSignedDocument,
        cmsSignature: declarationCmsSignature,
        certificate,
        profile,
      }),
    );
    const proof = await verifySignedArtifact.mock.results[0]?.value;
    expect(proof.tsaAt.getTime()).toBeGreaterThan(0);
    expect(resolvePartyCertificate).toHaveBeenCalledWith('tenant-a', 'party-a');
    assertValidReceipt(result, 'digital_verified', proof.tsaAt);
  });

  it('rejects reuse of a valid original document signature as withdrawal evidence', async () => {
    const { verifier, trustVerifier } = make();
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'digital_verified',
      signerPartyId: 'party-a',
      document: bltSourceDocument,
      contentHash: hex(bltSourceDocument),
      signedDocument: bltSignedDocument,
      cmsSignature: bltCmsSignature,
      evidenceBytes: bltCmsSignature,
      declarationDocument: bltSourceDocument,
      declarationSignedDocument: bltSignedDocument,
      declarationCmsSignature: bltCmsSignature,
      declarationCertificate: certificate,
    });
    expect(result.status).toBe('tampered');
    expect(result.reasons).toContain('DOCUMENT_SIGNATURE_REUSED');
    expect(trustVerifier.verifySignedArtifact).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong party certificate', '0'.repeat(64), declarationCmsSignature],
    ['wrong evidence bytes', hex(bytes('signer.cert.der')), cmsSignature],
  ])('rejects digital withdrawal with %s', async (_label, partyCertificateHash, suppliedEvidence) => {
    const trustVerifier = api.createCmsTrustVerifier({
      trustAnchorsPem: [rootPem],
      tsaTrustAnchorsPem: [rootPem],
      acceptedPolicies: profile.acceptedPolicies,
      now: () => now,
      fetchOcsp: async () => bytes('ocsp-good.der'),
      fetchCrl: async () => bytes('root.crl.der'),
      fetchTsa: async () => bytes('withdrawal-blt-timestamp.tsr'),
    });
    const verifier = new api.SignatureWithdrawalVerifier({
      trustVerifier,
      resolvePartyCertificate: async () => partyCertificateHash,
    });
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'digital_verified',
      signerPartyId: 'party-a',
      evidenceBytes: suppliedEvidence,
      declarationDocument,
      declarationSignedDocument,
      declarationCmsSignature,
      declarationCertificate: certificate,
    });
    expect(result.status).toBe('tampered');
  });

  it('rejects a forged production verifier and labels an acknowledged custom proof consumer-owned', async () => {
    const fake = {
      verifierKind: 'stynx-cms',
      verifySignedArtifact: vi.fn().mockResolvedValue({
        originalDocumentSha256: hex(declarationDocument),
        signedDocumentSha256: hex(declarationSignedDocument),
        cmsSha256: hex(declarationCmsSignature),
        signerCertificateSha256: hex(bytes('signer.cert.der')),
        tsaAt: now,
        verificationRef: 'custom-proof',
        achievedLevel: 'ADVANCED',
      }),
    };
    const input = {
      ...base,
      trustProfile: { ...profile, environment: 'production' },
      verificationMethod: 'digital_verified',
      signerPartyId: 'party-a',
      evidenceBytes: declarationCmsSignature,
      declarationDocument,
      declarationSignedDocument,
      declarationCmsSignature,
      declarationCertificate: certificate,
    };
    const options = {
      trustVerifier: fake,
      resolvePartyCertificate: async () => hex(bytes('signer.cert.der')),
    };
    await expect(new api.SignatureWithdrawalVerifier(options).verifyWithdrawalEvidence(input))
      .rejects.toMatchObject({ name: 'SignatureProviderConfigurationError' });
    const acknowledged = new api.SignatureWithdrawalVerifier({
      ...options,
      consumerOwnedVerifier: { acknowledged: true },
    });
    const result = await acknowledged.verifyWithdrawalEvidence(input);
    expect(result.status).toBe('valid');
    expect(result.evidence.verifierKind).toBe('consumer-owned');
  });

  it('rejects withdrawal in B’s name when A signed and B was injected into CMS/ESS', async () => {
    const trustVerifier = api.createCmsTrustVerifier({
      trustAnchorsPem: [rootPem],
      tsaTrustAnchorsPem: [rootPem],
      acceptedPolicies: profile.acceptedPolicies,
      now: () => now,
    });
    const verifier = new api.SignatureWithdrawalVerifier({
      trustVerifier,
      resolvePartyCertificate: async () => hex(bytes('spoof.cert.der')),
    });
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'digital_verified',
      signerPartyId: 'party-a',
      evidenceBytes: bytes('withdrawal-ess-spoof-blt.cms.der'),
      declarationDocument: bytes('withdrawal-ess-spoof-source.pdf'),
      declarationSignedDocument: bytes('withdrawal-ess-spoof-blt.pdf'),
      declarationCmsSignature: bytes('withdrawal-ess-spoof-blt.cms.der'),
      declarationCertificate: {
        ...certificate,
        pem: Buffer.from(bytes('spoof.cert.pem')).toString('utf8'),
      },
    });
    expect(result.status).toBe('tampered');
    expect(result.reasons).toContain('DIGITAL_SIGNATURE_INVALID');
  });

  it('rejects an attached CMS as a digital withdrawal declaration', async () => {
    const trustVerifier = api.createCmsTrustVerifier({
      trustAnchorsPem: [rootPem], tsaTrustAnchorsPem: [rootPem],
      acceptedPolicies: profile.acceptedPolicies, now: () => now,
    });
    const verifier = new api.SignatureWithdrawalVerifier({
      trustVerifier,
      resolvePartyCertificate: async () => hex(bytes('signer.cert.der')),
    });
    const attachedCms = bytes('withdrawal-attached-blt.cms.der');
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'digital_verified', signerPartyId: 'party-a',
      evidenceBytes: attachedCms,
      declarationDocument: bytes('withdrawal-attached-source.pdf'),
      declarationSignedDocument: bytes('withdrawal-attached-blt.pdf'),
      declarationCmsSignature: attachedCms,
      declarationCertificate: certificate,
    });
    expect(result.status).toBe('tampered');
    expect(result.reasons).toContain('DIGITAL_SIGNATURE_INVALID');
  });

  it.each([
    ['tenant', { tenantId: 'tenant-b' }],
    ['case', { caseId: 'case-b' }],
    ['document ID', { documentId: 'document-b' }],
    ['document hash', { contentHash: '0'.repeat(64) }],
    ['party', { signerPartyId: 'party-b' }],
  ])('rejects an attestation for another %s', async (_field, change) => {
    const { verifier } = make();
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'physical_verified',
      signerPartyId: 'party-a',
      ...change,
    });
    expect(result.status).toMatch(/^(tampered|ineligible)$/);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('distinguishes ineligible party from tampering', async () => {
    const { verifier } = make();
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'physical_verified',
      signerPartyId: 'party-a',
      eligiblePartyIds: ['party-b'],
    });
    expect(result.status).toBe('ineligible');
  });

  it.each([
    ['missing evidence reference', { evidenceRef: '' }],
    ['missing bytes', { evidenceBytes: new Uint8Array() }],
    ['unsigned JSON claim', { evidenceBytes: Buffer.from(JSON.stringify(valid)) }],
  ])('refuses %s', async (_field, change) => {
    const { verifier } = make();
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'physical_verified',
      signerPartyId: 'party-a',
      ...change,
    });
    expect(result.status).not.toBe('valid');
  });

  it('reports an unavailable trusted attestor and never accepts a free-text flag', async () => {
    const { verifier, attestor } = make();
    attestor.verifyAttestation.mockRejectedValue(new Error('attestor offline'));
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'physical_verified',
      signerPartyId: 'party-a',
    });
    expect(result.status).toBe('unavailable');
    expect(result.reasons).not.toEqual([]);
  });

  it('marks forged attestor proof untrusted and a corrupted CMS tampered', async () => {
    const { verifier, attestor, trustVerifier } = make({ ...valid, proofRef: '' });
    const forged = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'physical_verified',
      signerPartyId: 'party-a',
    });
    expect(forged.status).toBe('untrusted');
    trustVerifier.verifySignedArtifact.mockRejectedValue(new Error('bad CMS signature'));
    const digital = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'digital_verified',
      signerPartyId: 'party-a',
      evidenceBytes: declarationCmsSignature,
      declarationDocument,
      declarationSignedDocument,
      declarationCmsSignature,
      declarationCertificate: certificate,
    });
    expect(digital.status).toBe('tampered');
    expect(attestor.verifyAttestation).toHaveBeenCalledTimes(1);
  });
});
