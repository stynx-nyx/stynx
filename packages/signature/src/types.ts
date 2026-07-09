import type { IntegrationTelemetry, RetryPolicy } from '@stynx-nyx/integration-adapter';

export type SignatureAlgorithm = 'pades-baseline-t' | 'pades-ltv';

export type DigestAlgorithm = 'sha256';

export type RevocationSource = 'ocsp' | 'crl' | 'embedded' | 'none';

export interface SignatureCertificateRef {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore?: Date;
  notAfter?: Date;
  pem?: string | undefined;
}

export interface SignatureCredentialRef {
  certificateId?: string | undefined;
  keyId?: string | undefined;
  providerAccountId?: string | undefined;
}

export interface TsaOptions {
  endpoint: string;
  policyOid?: string | undefined;
  timeoutMs?: number | undefined;
  headers?: Record<string, string> | undefined;
}

export interface VerificationPolicy {
  requireTimestamp?: boolean | undefined;
  requireRevocationEvidence?: boolean | undefined;
  allowCrlFallback?: boolean | undefined;
  maxClockSkewMs?: number | undefined;
}

export interface SignatureRequest {
  tenantId: string;
  actorId: string;
  document: Uint8Array;
  documentSha256: string;
  tsa: TsaOptions;
  certificate: SignatureCertificateRef;
  credential?: SignatureCredentialRef | undefined;
  algorithm?: SignatureAlgorithm | undefined;
  digestAlgorithm?: DigestAlgorithm | undefined;
  idempotencyKey?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface SignatureEvidence {
  signatureId: string;
  documentSha256: string;
  signedAt: Date;
  tsaTime?: Date | undefined;
  signerCertificate: SignatureCertificateRef;
  certificateChainPem?: string[] | undefined;
  revocationSource: RevocationSource;
  revocationCheckedAt?: Date | undefined;
  providerEvidenceUri?: string | undefined;
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
  signedDocument?: Uint8Array | undefined;
  cmsSignature?: Uint8Array | undefined;
  policy?: VerificationPolicy | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface VerifyResult {
  status: 'valid' | 'invalid' | 'unknown';
  documentSha256: string;
  checkedAt: Date;
  signerCertificate?: SignatureCertificateRef | undefined;
  revocationSource: RevocationSource;
  revocationCheckedAt?: Date | undefined;
  certificateChainPem?: string[] | undefined;
  reasons: string[];
}

export interface SignatureBackend {
  sign(request: SignatureRequest): Promise<SignatureResult>;
  verify(request: VerifyRequest): Promise<VerifyResult>;
}

export interface CertificateValidationRequest {
  tenantId: string;
  actorId?: string | undefined;
  certificate: SignatureCertificateRef;
  allowCrlFallback: boolean;
  crlUrl?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface CertificateValidationResult {
  good: boolean;
  source: RevocationSource;
  checkedAt: Date;
  certificateChainPem?: string[] | undefined;
  reason?: string | undefined;
  providerEvidenceUri?: string | undefined;
}

export interface ProviderSignRequest {
  tenantId: string;
  actorId: string;
  document: Uint8Array;
  documentSha256: string;
  tsa: TsaOptions;
  certificate: SignatureCertificateRef;
  credential?: SignatureCredentialRef | undefined;
  algorithm: SignatureAlgorithm;
  digestAlgorithm: DigestAlgorithm;
  idempotencyKey?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface ProviderSignResult {
  signedDocument: Uint8Array;
  cmsSignature?: Uint8Array | undefined;
  signatureId?: string | undefined;
  signedAt?: Date | undefined;
  tsaTime?: Date | undefined;
  certificateChainPem?: string[] | undefined;
  revocationSource: RevocationSource;
  revocationCheckedAt?: Date | undefined;
  providerEvidenceUri?: string | undefined;
}

export interface ProviderVerifyRequest {
  tenantId: string;
  document: Uint8Array;
  documentSha256: string;
  signedDocument?: Uint8Array | undefined;
  cmsSignature?: Uint8Array | undefined;
  policy?: VerificationPolicy | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface SignatureProviderClient {
  validateCertificate(request: CertificateValidationRequest): Promise<CertificateValidationResult>;
  signPades(request: ProviderSignRequest): Promise<ProviderSignResult>;
  verifyPades(request: ProviderVerifyRequest): Promise<VerifyResult>;
}

export interface HttpSignatureProviderOptions {
  baseUrl?: string | undefined;
  pathPrefix?: string | undefined;
  timeoutMs?: number | undefined;
  headers?: Record<string, string> | undefined;
  crlUrl?: string | undefined;
  retryPolicy?: RetryPolicy | undefined;
  telemetry?: IntegrationTelemetry | undefined;
  fetch?: typeof fetch | undefined;
}

export interface StynxSignatureModuleOptions {
  provider?: HttpSignatureProviderOptions | undefined;
  backend?: SignatureBackend | undefined;
  providerClient?: SignatureProviderClient | undefined;
  verificationPolicy?: VerificationPolicy | undefined;
  now?: (() => Date) | undefined;
}
