/**
 * Public PAdES/TSA signature facade exports.
 *
 * @packageDocumentation
 */
import { createHash } from 'node:crypto';
import type {
  SignatureBackend,
  SignatureCertificateRef,
  SignatureEvidence,
  SignatureRequest,
  SignatureResult,
  VerifyRequest,
  VerifyResult,
} from './types';

export * from './types';

class UnimplementedSignatureBackend implements SignatureBackend {
  async sign(_request: SignatureRequest): Promise<SignatureResult> {
    // TODO(stynx-signature): port from PEC origin path ../pec/domain/signature-digital-signature/.
    throw new Error('No @stynx/signature backend configured');
  }

  async verify(_request: VerifyRequest): Promise<VerifyResult> {
    // TODO(stynx-signature): port from PEC origin path ../pec/domain/signature-digital-signature/.
    throw new Error('No @stynx/signature backend configured');
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertDocumentHash(document: Uint8Array, expectedSha256: string): void {
  const actual = sha256Hex(document);
  if (actual !== expectedSha256) {
    throw new Error(`Document SHA-256 mismatch: expected ${expectedSha256}, got ${actual}`);
  }
}

export class SignatureService {
  constructor(private readonly backend: SignatureBackend = new UnimplementedSignatureBackend()) {}

  async sign(request: SignatureRequest): Promise<SignatureResult> {
    assertDocumentHash(request.document, request.documentSha256);
    return this.backend.sign({
      ...request,
      algorithm: request.algorithm ?? 'pades-ltv',
      digestAlgorithm: request.digestAlgorithm ?? 'sha256',
    });
  }

  async verify(request: VerifyRequest): Promise<VerifyResult> {
    assertDocumentHash(request.document, request.documentSha256);
    return this.backend.verify(request);
  }
}

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
