/**
 * Public PAdES/TSA signature facade exports.
 *
 * @packageDocumentation
 */
import { sha256Hex } from './signature.service.js';
import type { SignatureBackend, SignatureCertificateRef, SignatureEvidence } from './types.js';
import { markMockSignatureBackend } from './backend-identity.js';

export * from './errors.js';
export * from './cms-trust-verifier.js';
export * from './readiness.js';
export * from './manifest.js';
export * from './withdrawal.js';
export * from './digest.js';
export * from './govbr-sandbox.js';
export * from './http-provider-client.js';
export * from './pades.js';
export * from './provider-backend.js';
export * from './sequential.js';
export * from './signature.module.js';
export * from './signature.service.js';
export * from './tokens.js';
export * from './trust-profile-set.js';
export * from './types.js';
export * from './xmldsig/index.js';

/**
 * Creates a deterministic in-memory signature backend for tests and local demos.
 */
export function createMockSignatureBackend(now: () => Date = () => new Date()): SignatureBackend {
  return markMockSignatureBackend({
    async sign(request) {
      const signedAt = now();
      const signatureId = sha256Hex(Buffer.from(`${request.tenantId}:${request.documentSha256}`));
      const evidence: SignatureEvidence = {
        signatureId,
        documentSha256: request.documentSha256,
        signedAt,
        tsaTime: signedAt,
        signerCertificate: request.certificate,
        certificateChainPem: [],
        revocationSource: 'ocsp',
        revocationCheckedAt: signedAt,
      };
      return {
        status: 'signed',
        signedDocument: request.document,
        cmsSignature: Buffer.from(`mock-cms:${signatureId}`),
        evidence,
      };
    },
    async verify(request) {
      const certificate: SignatureCertificateRef = {
        subject: 'CN=Mock Signer',
        issuer: 'CN=Mock ICP',
        serialNumber: 'mock-serial',
      };
      return {
        status: request.cmsSignature || request.signedDocument ? 'valid' : 'unknown',
        documentSha256: request.documentSha256,
        checkedAt: now(),
        signerCertificate: certificate,
        revocationSource: request.policy?.requireRevocationEvidence === false ? 'none' : 'ocsp',
        reasons: [],
      };
    },
  });
}
