import { createHash } from 'node:crypto';
import {
  SignatureHashMismatchError,
  SignatureProviderConfigurationError,
  SignatureProviderResponseError,
  SignatureCapabilityError,
  SignatureEvidenceMismatchError,
  SignatureLevelNotMetError,
  SignatureTrustError,
  SignatureTrustUnavailableError,
  SignatureVerificationInputError,
} from './errors';
import type {
  SignatureBackend,
  SignatureRequest,
  SignatureResult,
  SignatureTrustProfile,
  SignatureTrustProof,
  SignatureTrustVerifier,
  VerifyRequest,
  VerifyResult,
} from './types';
import { isCmsTrustVerifier } from './cms-trust-verifier';
import { isMockSignatureBackend } from './backend-identity';

class MissingSignatureBackend implements SignatureBackend {
  async sign(): Promise<SignatureResult> {
    throw new SignatureProviderConfigurationError();
  }

  async verify(): Promise<VerifyResult> {
    throw new SignatureProviderConfigurationError();
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertDocumentHash(document: Uint8Array, expectedSha256: string): void {
  const actual = sha256Hex(document);
  if (actual !== expectedSha256) {
    throw new SignatureHashMismatchError(expectedSha256, actual);
  }
}

export class SignatureService {
  constructor(
    private readonly backend: SignatureBackend = new MissingSignatureBackend(),
    private readonly options: { verifier?: SignatureTrustVerifier | undefined; trustVerifier?: SignatureTrustVerifier | undefined;
      consumerOwnedVerifier?: {acknowledged:true} | undefined } = {},
  ) {}

  private get verifier(): SignatureTrustVerifier | undefined {
    return this.options.trustVerifier ?? this.options.verifier;
  }

  async checkReadiness(profile: SignatureTrustProfile): Promise<{ok: true; capabilities: Awaited<ReturnType<SignatureTrustVerifier['capabilities']>>;verifierKind:'stynx-cms'|'consumer-owned'}> {
    const verifier = this.verifier;
    if (!verifier) throw new SignatureProviderConfigurationError('Trust verifier is required');
    if (profile.environment === 'production' && isMockSignatureBackend(this.backend))
      throw new SignatureCapabilityError('Simulated signature backend is unavailable in production');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_,reject) => {
      timer = setTimeout(() => reject(new SignatureCapabilityError('Signature capability check timed out')),5000);
    });
    let c: Awaited<ReturnType<SignatureTrustVerifier['capabilities']>>;
    try { c = await Promise.race([verifier.capabilities(profile),timeout]); }
    catch { throw new SignatureCapabilityError('Signature capability check unavailable'); }
    finally { if (timer) clearTimeout(timer); }
    if (!c || !Array.isArray(c.certificateValidation))
      throw new SignatureCapabilityError('Signature capability observation malformed');
    if (profile.environment === 'production' && c.simulated)
      throw new SignatureCapabilityError('Simulated signature verifier is unavailable in production');
    if (profile.environment === 'production' && !isCmsTrustVerifier(verifier) &&
      !this.options.consumerOwnedVerifier?.acknowledged)
      throw new SignatureProviderConfigurationError('Production trust verifier is unacknowledged');
    const observedAt=c?.checkedAt instanceof Date ? c.checkedAt.getTime() : NaN;
    const maxAge=profile.environment === 'production' ? 300_000 : 86_400_000;
    const recent = Number.isFinite(observedAt) && observedAt > 0 &&
      Math.abs(Date.now()-observedAt) <= maxAge;
    const revocation = profile.revocation === 'ocsp-or-crl'
      ? c.certificateValidation.some(x => x === 'ocsp' || x === 'crl')
      : c.certificateValidation.includes(profile.revocation);
    if (!['PAdES-B-T','PAdES-B-LT','PAdES-B-LTA'].includes(profile.requiredPadesProfile) ||
      !recent || !c.pades || (profile.requireTsa && !c.tsa) ||
      ((profile.requireLta || profile.requiredPadesProfile === 'PAdES-B-LTA') && !c.lta) || !revocation ||
      (profile.environment === 'production' && c.simulated)) {
      throw new SignatureCapabilityError('Required signature capability is unavailable');
    }
    return {ok: true, capabilities: c,verifierKind:isCmsTrustVerifier(verifier) ? 'stynx-cms':'consumer-owned'};
  }

  private regulatedProfile(minimum: NonNullable<SignatureRequest['minimumSignatureLevel']>, profile?: SignatureTrustProfile): SignatureTrustProfile {
    if (!profile || !this.verifier) throw new SignatureProviderConfigurationError('Trust profile and verifier are required');
    if (profile.environment === 'production' && !isCmsTrustVerifier(this.verifier) &&
      !this.options.consumerOwnedVerifier?.acknowledged)
      throw new SignatureProviderConfigurationError('Production trust verifier is unacknowledged');
    if (profile.environment === 'production' && isMockSignatureBackend(this.backend))
      throw new SignatureCapabilityError('Simulated signature backend is unavailable in production');
    if (minimum === 'QUALIFIED' && profile.minimumSignatureLevel !== 'QUALIFIED')
      throw new SignatureLevelNotMetError('Profile minimum is below requested level');
    return profile;
  }

  private async validateProof(
    input: {tenantId:string; document:Uint8Array; signedDocument:Uint8Array; cmsSignature:Uint8Array; certificate:NonNullable<SignatureRequest['certificate']>},
    profile: SignatureTrustProfile,
    minimum: NonNullable<SignatureRequest['minimumSignatureLevel']>,
  ): Promise<SignatureTrustProof> {
    if (!Buffer.from(input.signedDocument).subarray(0, 5).equals(Buffer.from('%PDF-')))
      throw new SignatureTrustError('Signed artifact is not a PDF');
    if (!input.cmsSignature.length || /^(mock-cms:|pades:)/u.test(Buffer.from(input.cmsSignature).toString('utf8',0,12)))
      throw new SignatureProviderResponseError('CMS signature is absent or synthetic');
    const proof = await this.verifier!.verifySignedArtifact({
      tenantId: input.tenantId, originalDocument: input.document,
      signedDocument: input.signedDocument, cmsSignature: input.cmsSignature,
      certificate: input.certificate, profile,
    });
    if (proof.originalDocumentSha256 !== sha256Hex(input.document) ||
      proof.signedDocumentSha256 !== sha256Hex(input.signedDocument) ||
      proof.cmsSha256 !== sha256Hex(input.cmsSignature) ||
      proof.profileId !== profile.id || proof.profileRevision !== profile.revision ||
      (input.certificate.pem && proof.signerCertificateSha256 !== sha256Hex(Buffer.from(input.certificate.pem.replace(/-----[^-]+-----|\s/gu,''),'base64'))))
      throw new SignatureEvidenceMismatchError('Verified signature binding differs from artifact');
    if (!(proof.tsaAt instanceof Date) || proof.tsaAt.getTime() <= 0 ||
        !(proof.signedAt instanceof Date) || proof.signedAt.getTime() <= 0)
      throw new SignatureTrustError('Trusted signing time is absent');
    const profiles = ['PAdES-B-T','PAdES-B-LT','PAdES-B-LTA'];
    if (profiles.indexOf(proof.padesProfile) < profiles.indexOf(profile.requiredPadesProfile) ||
      !profiles.includes(proof.padesProfile) ||
      (profile.revocation !== 'ocsp-or-crl' && proof.revocationSource !== profile.revocation) ||
      !Array.isArray(proof.chainSha256) || !proof.chainSha256.length)
      throw new SignatureTrustError('Verified signature profile is insufficient');
    if ((minimum === 'QUALIFIED' || profile.minimumSignatureLevel === 'QUALIFIED') &&
      proof.achievedLevel !== 'QUALIFIED')
      throw new SignatureLevelNotMetError('Signature level is below requested minimum');
    return {...proof, verifierKind: isCmsTrustVerifier(this.verifier!) ? 'stynx-cms' : 'consumer-owned'};
  }

  async sign(request: SignatureRequest): Promise<SignatureResult> {
    assertDocumentHash(request.document, request.documentSha256);
    if (request.minimumSignatureLevel) this.regulatedProfile(request.minimumSignatureLevel, request.trustProfile);
    const result = await this.backend.sign({
      ...request,
      algorithm: request.algorithm ?? 'pades-ltv',
      digestAlgorithm: request.digestAlgorithm ?? 'sha256',
    });
    if (!request.minimumSignatureLevel) return result;
    const profile = request.trustProfile!;
    if (!result.signedDocument?.length || !result.cmsSignature?.length)
      throw new SignatureProviderResponseError('Signed PDF and CMS are required');
    if (result.evidence.documentSha256 !== request.documentSha256)
      throw new SignatureEvidenceMismatchError('Provider document hash differs');
    if (!(result.evidence.signedAt instanceof Date) || result.evidence.signedAt.getTime() <= 0 ||
        !(result.evidence.tsaTime instanceof Date) || result.evidence.tsaTime.getTime() <= 0)
      throw new SignatureTrustError('Provider signing or TSA time is absent');
    const proof = await this.validateProof({tenantId:request.tenantId,document:request.document,
      signedDocument:result.signedDocument,cmsSignature:result.cmsSignature,certificate:request.certificate},
      profile, request.minimumSignatureLevel);
    return {...result, evidence:{...result.evidence, signedAt:proof.signedAt,tsaTime:proof.tsaAt,
      revocationSource:proof.revocationSource,revocationCheckedAt:proof.certificateValidatedAt,
      signatureLevel:proof.achievedLevel,verifierKind:proof.verifierKind,trustProof:proof}};
  }

  async verify(request: VerifyRequest): Promise<VerifyResult> {
    assertDocumentHash(request.document, request.documentSha256);
    if (!request.signedDocument && !request.cmsSignature) {
      throw new SignatureVerificationInputError();
    }
    if (!request.minimumSignatureLevel) return this.backend.verify(request);
    const profile = this.regulatedProfile(request.minimumSignatureLevel, request.trustProfile);
    if (!request.signedDocument?.length || !request.cmsSignature?.length)
      throw new SignatureVerificationInputError();
    try {
      const proof = await this.validateProof({tenantId:request.tenantId,document:request.document,
        signedDocument:request.signedDocument,cmsSignature:request.cmsSignature,
        certificate:request.certificate ?? {subject:'',issuer:'',serialNumber:''}},
        profile,request.minimumSignatureLevel);
      return {status:'valid',documentSha256:request.documentSha256,checkedAt:new Date(),
        revocationSource:proof.revocationSource,reasons:[],signatureLevel:proof.achievedLevel,
        verifierKind:proof.verifierKind,trustProof:proof};
    } catch (error) {
      return {status:error instanceof SignatureTrustUnavailableError ? 'unknown' :
        error instanceof SignatureTrustError || error instanceof SignatureProviderResponseError ||
          error instanceof SignatureEvidenceMismatchError ? 'invalid':'unknown',
        documentSha256:request.documentSha256,checkedAt:new Date(),revocationSource:'none',reasons:['TRUST_PROOF_FAILED']};
    }
  }
}
