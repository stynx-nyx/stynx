import * as sig from '../../src';
import {
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
    verifier: new api.SignatureWithdrawalVerifier({ attestor, trustVerifier }),
    attestor,
    trustVerifier,
  };
};
const assertValidReceipt = (result: any, method: string) => {
  expect(result.status).toBe('valid');
  expect(result.evidence).toMatchObject({
    tenantId: 'tenant-a',
    caseId: 'case-a',
    documentId: 'document-a',
    contentHash: hex(sourceDocument),
    signerPartyId: 'party-a',
    verificationMethod: method,
    evidenceRef: 'attestation-a',
    verifiedAt: now,
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
      fetchTsa: async () => bytes('timestamp.tsr'),
    });
    const verifySignedArtifact = vi.spyOn(trustVerifier, 'verifySignedArtifact');
    const verifier = new api.SignatureWithdrawalVerifier({ trustVerifier });
    const result = await verifier.verifyWithdrawalEvidence({
      ...base,
      verificationMethod: 'digital_verified',
      signerPartyId: 'party-a',
      signedDocument,
      cmsSignature,
      certificate,
    });
    expect(verifySignedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        originalDocument: sourceDocument,
        signedDocument,
        cmsSignature,
        certificate,
        profile,
      }),
    );
    assertValidReceipt(result, 'digital_verified');
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
      signedDocument,
      cmsSignature,
      certificate,
    });
    expect(digital.status).toBe('tampered');
    expect(attestor.verifyAttestation).toHaveBeenCalledTimes(1);
  });
});
