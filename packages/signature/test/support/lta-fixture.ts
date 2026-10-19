import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCmsTrustVerifier } from '../../src/cms-trust-verifier.js';
import type { CmsTrustVerifierOptions } from '../../src/cms-trust-verifier.js';
import type { SignatureTrustProfile } from '../../src/types.js';

const directory = join(__dirname, '../fixtures/lta');
export const ltaBytes = (name: string): Buffer => readFileSync(join(directory, name));
export const ltaPem = (name: string): string => ltaBytes(name).toString('utf8');
export const ltaDigest = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');
export const ltaArchiveAt = new Date('2026-10-10T14:12:46.000Z');
export const ltaRoots = [
  ltaPem('signer-root.cert.pem'),
  ltaPem('signature-tsa-root.cert.pem'),
  ltaPem('archive-tsa-root.cert.pem'),
];
export const ltaProfile: SignatureTrustProfile = {
  id: 'synthetic-lta-test',
  revision: '1',
  environment: 'test',
  minimumSignatureLevel: 'ADVANCED',
  requiredPadesProfile: 'PAdES-B-LTA',
  requireTsa: true,
  requireLta: true,
  revocation: 'crl',
  trustAnchorsPem: ltaRoots,
  atTime: 'trusted-timestamp',
};
export const ltaInput = (
  name = 'minimal-lta.pdf',
  profile: SignatureTrustProfile = ltaProfile,
) => ({
  tenantId: 'lta-test-tenant',
  originalDocument: ltaBytes('source.pdf'),
  signedDocument: ltaBytes(name),
  cmsSignature: ltaBytes('signature.cms.der'),
  certificate: {
    subject: 'CN=DETRAN TEST ONLY signer',
    issuer: 'CN=DETRAN TEST ONLY signer-root',
    serialNumber: '03E9',
    pem: ltaPem('signer.cert.pem'),
  },
  profile,
});
export const ltaVerifier = (options: Partial<CmsTrustVerifierOptions> = {}) =>
  createCmsTrustVerifier({
    trustAnchorsPem: ltaRoots,
    tsaTrustAnchorsPem: [ltaRoots[1]!],
    archiveTsaTrustAnchorsPem: [ltaRoots[2]!],
    now: () => new Date(ltaArchiveAt),
    ...options,
  });
