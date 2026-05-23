export type SignatureAlgorithm = 'pades-baseline-t' | 'pades-ltv';

export type DigestAlgorithm = 'sha256';

export type RevocationSource = 'ocsp' | 'crl' | 'embedded' | 'none';

export interface SignatureCertificateRef {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore?: Date;
  notAfter?: Date;
}

export interface TsaOptions {
  endpoint: string;
  policyOid?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface VerificationPolicy {
  requireTimestamp?: boolean;
  requireRevocationEvidence?: boolean;
  allowCrlFallback?: boolean;
  maxClockSkewMs?: number;
}

export interface SignatureRequest {
  tenantId: string;
  actorId: string;
  document: Uint8Array;
  documentSha256: string;
  tsa: TsaOptions;
  certificate: SignatureCertificateRef;
  algorithm?: SignatureAlgorithm;
  digestAlgorithm?: DigestAlgorithm;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface SignatureEvidence {
  signatureId: string;
  documentSha256: string;
  signedAt: Date;
  tsaTime?: Date;
  signerCertificate: SignatureCertificateRef;
  certificateChainPem?: string[];
  revocationSource: RevocationSource;
  revocationCheckedAt?: Date;
  providerEvidenceUri?: string;
}

export interface SignatureResult {
  status: 'signed';
  signedDocument: Uint8Array;
  cmsSignature: Uint8Array;
  evidence: SignatureEvidence;
}

export interface VerifyRequest {
  tenantId: string;
  document: Uint8Array;
  documentSha256: string;
  signedDocument?: Uint8Array;
  cmsSignature?: Uint8Array;
  policy?: VerificationPolicy;
  metadata?: Record<string, string>;
}

export interface VerifyResult {
  status: 'valid' | 'invalid' | 'unknown';
  documentSha256: string;
  checkedAt: Date;
  signerCertificate?: SignatureCertificateRef;
  revocationSource: RevocationSource;
  reasons: string[];
}

export interface SignatureBackend {
  sign(request: SignatureRequest): Promise<SignatureResult>;
  verify(request: VerifyRequest): Promise<VerifyResult>;
}
