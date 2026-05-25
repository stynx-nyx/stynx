/**
 * Public PAdES/TSA signature facade exports.
 *
 * @packageDocumentation
 */
import { sha256Hex } from './signature.service';
import type { SignatureBackend, SignatureCertificateRef, SignatureEvidence } from './types';

export * from './errors';
export * from './digest';
export * from './govbr-sandbox';
export * from './http-provider-client';
export * from './pades';
export * from './provider-backend';
export * from './sequential';
export * from './signature.module';
export * from './signature.service';
export * from './tokens';
export * from './types';

export function createMockSignatureBackend(now: () => Date = () => new Date()): SignatureBackend {
  return {
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
  };
}
