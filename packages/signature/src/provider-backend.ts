import { createHash } from 'node:crypto';
import { SignatureCertificateValidationError } from './errors';
import type {
  ProviderSignResult,
  SignatureBackend,
  SignatureEvidence,
  SignatureProviderClient,
  SignatureRequest,
  SignatureResult,
  VerificationPolicy,
  VerifyRequest,
  VerifyResult,
} from './types';

export class ProviderBackedSignatureBackend implements SignatureBackend {
  constructor(
    private readonly provider: SignatureProviderClient,
    private readonly options: {
      verificationPolicy?: VerificationPolicy | undefined;
      crlUrl?: string | undefined;
      now?: (() => Date) | undefined;
    } = {},
  ) {}

  async sign(request: SignatureRequest): Promise<SignatureResult> {
    const policy = this.options.verificationPolicy ?? {};
    const validation = await this.provider.validateCertificate({
      tenantId: request.tenantId,
      actorId: request.actorId,
      certificate: request.certificate,
      allowCrlFallback: policy.allowCrlFallback ?? true,
      crlUrl: this.options.crlUrl,
      metadata: request.metadata,
    });
    if (!validation.good) {
      throw new SignatureCertificateValidationError(validation.reason);
    }

    const signed = await this.provider.signPades({
      ...request,
      algorithm: request.algorithm ?? 'pades-ltv',
      digestAlgorithm: request.digestAlgorithm ?? 'sha256',
    });
    const signedAt = signed.signedAt ?? signed.tsaTime ?? this.now();
    const evidence: SignatureEvidence = {
      signatureId: signed.signatureId ?? signatureIdFor(request, signed),
      documentSha256: request.documentSha256,
      signedAt,
      ...(signed.tsaTime ? { tsaTime: signed.tsaTime } : {}),
      signerCertificate: request.certificate,
      certificateChainPem: signed.certificateChainPem ?? validation.certificateChainPem ?? [],
      revocationSource: signed.revocationSource === 'none' ? validation.source : signed.revocationSource,
      revocationCheckedAt: signed.revocationCheckedAt ?? validation.checkedAt,
      ...(signed.providerEvidenceUri ?? validation.providerEvidenceUri
        ? { providerEvidenceUri: signed.providerEvidenceUri ?? validation.providerEvidenceUri }
        : {}),
    };
    return {
      status: 'signed',
      signedDocument: signed.signedDocument,
      cmsSignature: signed.cmsSignature ?? Buffer.from(`pades:${evidence.signatureId}`),
      evidence,
    };
  }

  verify(request: VerifyRequest): Promise<VerifyResult> {
    return this.provider.verifyPades({
      ...request,
      policy: {
        ...(this.options.verificationPolicy ?? {}),
        ...(request.policy ?? {}),
      },
    });
  }

  private now(): Date {
    return this.options.now ? this.options.now() : new Date();
  }
}

function signatureIdFor(request: SignatureRequest, signed: ProviderSignResult): string {
  return createHash('sha256')
    .update(request.tenantId)
    .update(':')
    .update(request.documentSha256)
    .update(':')
    .update(signed.tsaTime?.toISOString() ?? '')
    .digest('hex');
}
