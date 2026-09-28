import * as sig from '../../src';
import {
  bltCmsSignature as cmsSignature,
  bltSignedDocument as signedDocument,
  bltSourceDocument as sourceDocument,
  bytes,
  certificate,
  hex,
  now,
  profile,
  rootPem,
} from '../fixtures/trust';
import { buildManifestBoundPades } from '../fixtures/pki/bound-pades';

// UPS-SIG-03 / INV-SIGNATURE-001. The positive path below uses the concrete
// STYNX verifier and a PDF whose manifest hash is inside the signed ByteRange.
// Doubles isolate the mutation matrix and cannot establish qualification.
const api = sig as Record<string, any>;
const snapshot = Buffer.from('{"minutes":"approved"}');
const make = () => {
  expect(api.SignatureManifestService).toEqual(expect.any(Function));
  const baseProof = {
    verifierKind: 'stynx-cms',
    profileId: profile.id,
    profileRevision: profile.revision,
    achievedLevel: 'ADVANCED',
    padesProfile: 'PAdES-B-LT',
    originalDocumentSha256: hex(sourceDocument),
    signedDocumentSha256: hex(signedDocument),
    cmsSha256: hex(cmsSignature),
    signerCertificateSha256: hex(bytes('signer.cert.der')),
    chainSha256: [hex(bytes('root.cert.pem'))],
    signedAt: now,
    tsaAt: now,
    certificateValidatedAt: now,
    revocationSource: 'ocsp',
    verificationRef: 'signed-ocsp-1',
  };
  const verifier = {
    verifySignedArtifact: vi.fn().mockImplementation(async (input: any) => ({
      ...baseProof,
      boundManifestSha256: input.expectedManifestSha256,
    })),
  };
  return {
    manifests: new api.SignatureManifestService({ verifier, trustVerifier: verifier }),
    verifier,
  };
};
const common = {
  tenantId: 'tenant-a',
  aggregateId: 'aggregate-a',
  documentId: 'document-a',
  documentKind: 'minutes',
  document: sourceDocument,
  documentSha256: hex(sourceDocument),
  snapshot,
  snapshotSha256: hex(snapshot),
  requiredSignerIds: ['chair', 'secretary'],
  preparedAt: now,
};
const signer = (signerId: string) => ({
  signerId,
  signatureId: `signature-${signerId}`,
  signedDocument,
  cmsSignature,
  certificate,
  trustProfile: profile,
});
const prepared = (manifests: any, kind: 'session' | 'batch') =>
  kind === 'session'
    ? manifests.prepareSession({ ...common, sessionId: 'session-a', minutesId: 'minutes-a' })
    : manifests.prepareBatch({ ...common, batchId: 'batch-a' });

describe.each(['session', 'batch'] as const)('%s minutes manifest', (kind) => {
  it('accepts a signer only when the real CMS verifier reads the signed manifest hash', async () => {
    expect(api.SignatureManifestService).toEqual(expect.any(Function));
    expect(api.createCmsTrustVerifier).toEqual(expect.any(Function));
    let timestampToken: Uint8Array | undefined;
    const trustVerifier = api.createCmsTrustVerifier({
      trustAnchorsPem: [rootPem],
      tsaTrustAnchorsPem: [rootPem],
      acceptedPolicies: profile.acceptedPolicies,
      now: () => now,
      fetchOcsp: async () => bytes('ocsp-good.der'),
      fetchCrl: async () => bytes('root.crl.der'),
      fetchTsa: async () => timestampToken,
    });
    const manifests = new api.SignatureManifestService({ verifier: trustVerifier });
    const manifest =
      kind === 'session'
        ? manifests.prepareSession({
            ...common,
            sessionId: 'session-a',
            minutesId: 'minutes-a',
            requiredSignerIds: ['chair'],
          })
        : manifests.prepareBatch({ ...common, batchId: 'batch-a', requiredSignerIds: ['chair'] });
    const signed = buildManifestBoundPades(manifest.manifestSha256);
    timestampToken = signed.timestampToken;
    const artifact = {
      signerId: 'chair',
      signatureId: 'signature-chair',
      signedDocument: signed.signedDocument,
      cmsSignature: signed.cmsSignature,
      certificate,
      trustProfile: profile,
      timestampToken: signed.timestampToken,
    };
    const completed = await manifests.appendVerifiedSigner(manifest, artifact, { sourceDocument, snapshot });
    const checked = await manifests.verifyManifest({
      manifest: completed,
      sourceDocument,
      snapshot,
      signers: [artifact],
    });
    expect(checked.status).toBe('valid');
    expect(completed.signers[0]).toMatchObject({
      signerId: 'chair',
      signedDocumentSha256: hex(signed.signedDocument),
      cmsSha256: hex(signed.cmsSignature),
    });
  });

  it('binds exact canonical bytes, source/snapshot hashes and signer order', async () => {
    const { manifests, verifier } = make();
    const manifest = prepared(manifests, kind);
    expect(manifest).toMatchObject({
      manifestVersion: '1',
      canonicalization: 'RFC8785-JCS',
      tenantId: 'tenant-a',
      documentId: 'document-a',
      documentSha256: hex(sourceDocument),
      snapshotSha256: hex(snapshot),
      requiredSignerIds: ['chair', 'secretary'],
    });
    const first = await manifests.appendVerifiedSigner(manifest, signer('chair'), { sourceDocument, snapshot });
    expect(verifier.verifySignedArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        originalDocument: sourceDocument,
        signedDocument,
        cmsSignature,
        expectedManifestSha256: manifest.manifestSha256,
      }),
    );
    const second = await manifests.appendVerifiedSigner(first, signer('secretary'), { sourceDocument, snapshot });
    const result = await manifests.verifyManifest({
      manifest: second,
      sourceDocument,
      snapshot,
      signers: [signer('chair'), signer('secretary')],
    });
    expect(result).toMatchObject({ status: 'valid' });
    expect(second.signers.map((x: any) => x.signerId)).toEqual(['chair', 'secretary']);
    expect(second.signers.map((x: any) => x.order)).toEqual([1, 2]);
  });

  it('appends after JSON persistence using explicit source and snapshot bytes', async () => {
    const { manifests } = make();
    const stored = JSON.parse(JSON.stringify(prepared(manifests, kind)));
    const first = await manifests.appendVerifiedSigner(stored, signer('chair'), {
      sourceDocument,
      snapshot,
    });
    expect(first.signers).toHaveLength(1);
    await expect(manifests.appendVerifiedSigner(stored, signer('chair'), {
      sourceDocument: Buffer.from('unrelated source'),
      snapshot,
    })).rejects.toBeInstanceOf(sig.SignatureError);
    await expect(manifests.appendVerifiedSigner(stored, signer('chair'), {
      sourceDocument,
      snapshot: Buffer.from('unrelated snapshot'),
    })).rejects.toBeInstanceOf(sig.SignatureError);
  });

  it('rejects a forged STYNX verifier in production and records acknowledged ownership', async () => {
    const { verifier } = make();
    const forged = Object.assign(verifier, { verifierKind: 'stynx-cms' });
    const artifact = { ...signer('chair'), trustProfile: { ...profile, environment: 'production' } };
    const unacknowledged = new api.SignatureManifestService({ verifier: forged });
    const initial = prepared(unacknowledged, kind);
    await expect(unacknowledged.appendVerifiedSigner(initial, artifact, { sourceDocument, snapshot }))
      .rejects.toMatchObject({ name: 'SignatureProviderConfigurationError' });
    const acknowledged = new api.SignatureManifestService({
      verifier: forged,
      consumerOwnedVerifier: { acknowledged: true },
    });
    const completed = await acknowledged.appendVerifiedSigner(initial, artifact, { sourceDocument, snapshot });
    expect(completed.signers[0]?.verifierKind).toBe('consumer-owned');
    const final = await acknowledged.appendVerifiedSigner(completed, {
      ...artifact,
      signerId: 'secretary',
    }, { sourceDocument, snapshot });
    expect((await acknowledged.verifyManifest({
      manifest: final,
      sourceDocument,
      snapshot,
      signers: [artifact, { ...artifact, signerId: 'secretary' }],
    })).status).toBe('valid');
  });

  it('distinguishes unavailable verifier evidence from untrusted evidence', async () => {
    const { manifests, verifier } = make();
    const first = await manifests.appendVerifiedSigner(prepared(manifests, kind), signer('chair'), { sourceDocument, snapshot });
    const complete = await manifests.appendVerifiedSigner(first, signer('secretary'), { sourceDocument, snapshot });
    verifier.verifySignedArtifact.mockRejectedValueOnce(new api.SignatureTrustUnavailableError('OCSP unavailable'));
    expect((await manifests.verifyManifest({
      manifest: complete,
      sourceDocument,
      snapshot,
      signers: [signer('chair'), signer('secretary')],
    })).status).toBe('unavailable');
    verifier.verifySignedArtifact.mockRejectedValueOnce(new api.SignatureTrustError('OCSP invalid'));
    expect((await manifests.verifyManifest({
      manifest: complete,
      sourceDocument,
      snapshot,
      signers: [signer('chair'), signer('secretary')],
    })).status).toBe('untrusted');
  });

  it.each([
    ['tenant', { tenantId: 'other-tenant' }],
    ['document ID', { documentId: 'other-document' }],
    ['document hash', { documentSha256: '0'.repeat(64) }],
    ['snapshot hash', { snapshotSha256: '0'.repeat(64) }],
    ['aggregate', { aggregateId: 'other-aggregate' }],
    ['manifest version', { manifestVersion: '2' }],
    ['signer order', { requiredSignerIds: ['secretary', 'chair'] }],
    ['missing signer', { requiredSignerIds: ['chair'] }],
    ['duplicate signer', { requiredSignerIds: ['chair', 'chair'] }],
    ['epoch zero', { preparedAt: new Date(0) }],
  ])('refuses altered %s', async (_field, change) => {
    const { manifests } = make();
    const manifest = prepared(manifests, kind);
    const result = await manifests.verifyManifest({
      manifest: { ...manifest, ...change },
      sourceDocument,
      snapshot,
      signers: [],
    });
    expect(result.status).not.toBe('valid');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('rejects a proof with missing or mismatched signed manifest binding', async () => {
    const { manifests, verifier } = make();
    const manifest = prepared(manifests, kind);
    verifier.verifySignedArtifact.mockResolvedValueOnce({
      verifierKind: 'stynx-cms',
      achievedLevel: 'ADVANCED',
    });
    await expect(manifests.appendVerifiedSigner(manifest, signer('chair'), { sourceDocument, snapshot })).rejects.toBeInstanceOf(
      sig.SignatureError,
    );
    verifier.verifySignedArtifact.mockResolvedValueOnce({
      verifierKind: 'stynx-cms',
      achievedLevel: 'ADVANCED',
      boundManifestSha256: '0'.repeat(64),
    });
    await expect(manifests.appendVerifiedSigner(manifest, signer('chair'), { sourceDocument, snapshot })).rejects.toBeInstanceOf(
      sig.SignatureError,
    );
  });

  it.each([
    ['signer identity', 'signerId', 'other-signer'],
    ['signer order', 'order', 2],
    ['signature ID', 'signatureId', 'other-signature'],
    ['PDF hash', 'signedDocumentSha256', '0'.repeat(64)],
    ['CMS hash', 'cmsSha256', '0'.repeat(64)],
    ['certificate hash', 'signerCertificateSha256', '0'.repeat(64)],
    ['PAdES profile', 'padesProfile', 'PAdES-B-T'],
    ['achieved level', 'achievedLevel', 'QUALIFIED'],
    ['TSA instant', 'tsaAt', '1970-01-01T00:00:00.000Z'],
    ['revocation reference', 'verificationRef', 'other-proof'],
    ['previous entry', 'previousEntryHash', '0'.repeat(64)],
  ])('detects altered signer %s', async (_label, field, altered) => {
    const { manifests } = make();
    const first = await manifests.appendVerifiedSigner(prepared(manifests, kind), signer('chair'), { sourceDocument, snapshot });
    const complete = await manifests.appendVerifiedSigner(first, signer('secretary'), { sourceDocument, snapshot });
    const tampered = structuredClone(complete);
    tampered.signers[0][field] = altered;
    const checked = await manifests.verifyManifest({
      manifest: tampered,
      sourceDocument,
      snapshot,
      signers: [signer('chair'), signer('secretary')],
    });
    expect(checked.status).toBe('tampered');
    expect(checked.reasons.length).toBeGreaterThan(0);
  });
});

describe('RFC 8785 canonical bytes', () => {
  const referenceJcs = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(referenceJcs).join(',')}]`;
    if (value !== null && typeof value === 'object') {
      return `{${Object.keys(value)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${referenceJcs((value as Record<string, unknown>)[k])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value) as string;
  };
  it.each([
    [{ z: 1, a: 2 }, '{"a":2,"z":1}'],
    [{ n: 1e30, small: 0.000001 }, '{"n":1e+30,"small":0.000001}'],
    [{ text: 'é', supplementary: '𝄞' }, '{"supplementary":"𝄞","text":"é"}'],
  ])('anchors reference Unicode and number vectors', (value, expected) => {
    expect(referenceJcs(value)).toBe(expected);
  });

  it('hashes the actual manifest with RFC 8785 bytes, excluding its hash', () => {
    const { manifests } = make();
    const manifest = manifests.prepareSession({
      ...common,
      tenantId: 'tenánt-𝄞',
      sessionId: 'sessão',
      minutesId: 'ata',
    });
    const { manifestSha256, ...hashInput } = manifest;
    expect(manifestSha256).toBe(hex(Buffer.from(referenceJcs(hashInput), 'utf8')));
  });

  it.each([
    new Date(),
    undefined,
    1n,
    Number.NaN,
    Infinity,
    new Uint8Array([1]),
    Object.create(null),
  ])('rejects unsupported JSON tenant value %s', (value) => {
    const { manifests } = make();
    expect(() =>
      manifests.prepareSession({
        ...common,
        tenantId: value,
        sessionId: 'session-a',
        minutesId: 'minutes-a',
      }),
    ).toThrow();
  });

  it('does not treat the legacy digest envelope as a verified minutes signature', () => {
    const legacy = new sig.SequentialSigner({
      expectedSignerIds: ['chair'],
      now: () => new Date(0),
    });
    const envelope = legacy.append(legacy.create(sourceDocument), {
      id: 'chair',
      subject: 'CN=STYNX Test Signer',
      serial: '1001',
    });
    expect(envelope.signatures[0]?.signedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(envelope.signatures[0]).not.toHaveProperty('cmsSha256');
  });
});

describe('manifest-bound PDF fixture', () => {
  it('has a real signed ByteRange containing the manifest hash', () => {
    const manifestSha256 = 'a'.repeat(64);
    const artifact = buildManifestBoundPades(manifestSha256);
    const pdf = Buffer.from(artifact.signedDocument);
    const text = pdf.toString('binary');
    expect(text).toContain(`/STYNXManifestSHA256 (${manifestSha256})`);
    const match = /\/ByteRange \[(\d+) (\d+) (\d+) (\d+)\]/u.exec(text);
    expect(match).not.toBeNull();
    const [, start, before, after, tail] = match!;
    const covered = Buffer.concat([
      pdf.subarray(Number(start), Number(start) + Number(before)),
      pdf.subarray(Number(after), Number(after) + Number(tail)),
    ]);
    // buildManifestBoundPades has already verified CMS over these bytes with OpenSSL.
    expect(covered.includes(Buffer.from(manifestSha256))).toBe(true);
    expect(artifact.timestampToken.length).toBeGreaterThan(0);
  });
});
