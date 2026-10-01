import type { IntegrationTelemetry, RetryPolicy } from '@stynx-nyx/integration-adapter';

export type SignatureAlgorithm = 'pades-baseline-t' | 'pades-ltv';

export type DigestAlgorithm = 'sha256';

export type RevocationSource = 'ocsp' | 'crl' | 'embedded' | 'none';
export type SignatureLevel = 'ADVANCED' | 'QUALIFIED';
export type SignatureVerifierKind = 'stynx-cms' | 'consumer-owned';
/** Rule by which the STYNX verifier attained QUALIFIED: a profile/verifier policy OID or the consumer predicate. */
export type SignatureQualificationRule = 'certificate-policy' | 'consumer-predicate';
export interface SignatureTrustProfile {
  id: string;
  revision: string;
  environment: 'production' | 'test';
  minimumSignatureLevel: SignatureLevel;
  requiredPadesProfile: 'PAdES-B-T' | 'PAdES-B-LT' | 'PAdES-B-LTA';
  requireTsa: boolean;
  requireLta: boolean;
  revocation: 'ocsp' | 'crl' | 'ocsp-or-crl';
  trustAnchorsPem: readonly string[];
  acceptedPolicies?: readonly string[];
  /** Signer certificate policy OIDs (2.5.29.32) that confer QUALIFIED for this profile; consumer-supplied. */
  qualifiedPolicies?: readonly string[];
  atTime: 'signing-time' | 'trusted-timestamp';
}
export interface SignatureCapabilities {
  simulated: boolean;
  pades: boolean;
  tsa: boolean;
  lta: boolean;
  certificateValidation: readonly ('ocsp' | 'crl')[];
  evidenceSource: string;
  checkedAt: Date;
}
export interface SignatureTrustProof {
  verifierKind: SignatureVerifierKind;
  profileId: string;
  profileRevision: string;
  achievedLevel: SignatureLevel;
  /** Present only when `achievedLevel` is QUALIFIED; records the rule that attained it. */
  qualifiedBy?: SignatureQualificationRule;
  padesProfile: SignatureTrustProfile['requiredPadesProfile'];
  originalDocumentSha256: string;
  signedDocumentSha256: string;
  cmsSha256: string;
  signerCertificateSha256: string;
  chainSha256: readonly string[];
  signedAt: Date;
  tsaAt: Date;
  certificateValidatedAt: Date;
  revocationSource: 'ocsp' | 'crl';
  verificationRef: string;
  boundManifestSha256?: string;
}
export interface SignatureTrustVerifier {
  capabilities(profile: SignatureTrustProfile): Promise<SignatureCapabilities>;
  verifySignedArtifact(input: {
    tenantId: string;
    originalDocument: Uint8Array;
    signedDocument: Uint8Array;
    cmsSignature: Uint8Array;
    certificate: SignatureCertificateRef;
    profile: SignatureTrustProfile;
    expectedManifestSha256?: string;
  }): Promise<SignatureTrustProof>;
}

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
  minimumSignatureLevel?: SignatureLevel;
  trustProfile?: SignatureTrustProfile;
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
  signatureLevel?: SignatureLevel;
  verifierKind?: SignatureVerifierKind;
  trustProof?: SignatureTrustProof;
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
  minimumSignatureLevel?: SignatureLevel;
  trustProfile?: SignatureTrustProfile;
  certificate?: SignatureCertificateRef;
  tenantId: string;
  document: Uint8Array;
  documentSha256: string;
  signedDocument?: Uint8Array | undefined;
  cmsSignature?: Uint8Array | undefined;
  policy?: VerificationPolicy | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface VerifyResult {
  signatureLevel?: SignatureLevel;
  verifierKind?: SignatureVerifierKind;
  trustProof?: SignatureTrustProof;
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
  healthWitness?: object;
  trustProfile?: SignatureTrustProfile;
  verifier?: SignatureTrustVerifier;
  trustVerifier?: SignatureTrustVerifier;
  consumerOwnedVerifier?: { acknowledged: true };
  provider?: HttpSignatureProviderOptions | undefined;
  backend?: SignatureBackend | undefined;
  providerClient?: SignatureProviderClient | undefined;
  verificationPolicy?: VerificationPolicy | undefined;
  now?: (() => Date) | undefined;
}
