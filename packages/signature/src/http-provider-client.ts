import { IntegrationAdapter } from '@stynx/integration-adapter';
import {
  SignatureProviderConfigurationError,
  SignatureProviderError,
  SignatureProviderResponseError,
} from './errors';
import type {
  CertificateValidationRequest,
  CertificateValidationResult,
  HttpSignatureProviderOptions,
  ProviderSignRequest,
  ProviderSignResult,
  ProviderVerifyRequest,
  RevocationSource,
  SignatureCertificateRef,
  VerifyResult,
} from './types';

type UpperRevocationSource = 'OCSP' | 'CRL' | 'EMBEDDED' | 'NONE';

interface HttpRequest {
  endpoint?: string | undefined;
  path: string;
  body: Record<string, unknown>;
  headers?: Record<string, string> | undefined;
  idempotencyKey?: string | undefined;
  circuitBreakerKey: string;
}

interface ValidationWireResponse {
  good: boolean;
  source: UpperRevocationSource;
  checkedAt?: string;
  certificateChainPem?: string[];
  reason?: string;
  providerEvidenceUri?: string;
}

interface SignWireResponse {
  signedPdfBase64: string;
  cmsSignatureBase64?: string;
  signatureId?: string;
  signedAt?: string;
  tsaTime?: string;
  certificateChainPem?: string[];
  revocationSource?: UpperRevocationSource;
  revocationCheckedAt?: string;
  providerEvidenceUri?: string;
}

interface VerifyWireResponse {
  status: 'valid' | 'invalid' | 'unknown';
  checkedAt?: string;
  signerCertificate?: SignatureCertificateRef;
  revocationSource?: UpperRevocationSource;
  revocationCheckedAt?: string;
  certificateChainPem?: string[];
  reasons?: string[];
}

export class HttpSignatureProviderClient {
  private readonly adapter: IntegrationAdapter<HttpRequest, unknown, unknown>;
  private readonly pathPrefix: string;
  private readonly defaultHeaders: Record<string, string>;

  constructor(private readonly options: HttpSignatureProviderOptions = {}) {
    this.pathPrefix = normalizePathPrefix(options.pathPrefix ?? '/mock');
    this.defaultHeaders = options.headers ?? {};
    this.adapter = new IntegrationAdapter<HttpRequest, unknown, unknown>({
      name: 'stynx-signature-provider',
      request: async (input) => this.request(input),
      parseResponse: (raw) => raw,
      retryPolicy: options.retryPolicy ?? { maxAttempts: 2, baseDelayMs: 250, maxDelayMs: 1_000 },
      timeoutMs: options.timeoutMs ?? 15_000,
      idempotencyKey: (input) => input.idempotencyKey,
      circuitBreakerKey: (input) => input.circuitBreakerKey,
      ...(options.telemetry ? { telemetry: options.telemetry } : {}),
    });
  }

  async validateCertificate(
    request: CertificateValidationRequest,
  ): Promise<CertificateValidationResult> {
    const raw = await this.execute<ValidationWireResponse>({
      endpoint: this.options.baseUrl,
      path: this.path('/tsa/ocsp/validate'),
      circuitBreakerKey: 'certificate-validation',
      body: {
        tenantId: request.tenantId,
        actorId: request.actorId,
        certificate: serializeCertificate(request.certificate),
        certificatePem: request.certificate.pem,
        allowCrlFallback: request.allowCrlFallback,
        crlUrl: request.crlUrl ?? this.options.crlUrl,
        metadata: request.metadata,
      },
    });
    assertBoolean(raw.good, 'good');
    assertRevocationSource(raw.source, 'source');
    return {
      good: raw.good,
      source: toRevocationSource(raw.source),
      checkedAt: parseDate(raw.checkedAt, 'checkedAt'),
      ...(raw.certificateChainPem ? { certificateChainPem: raw.certificateChainPem } : {}),
      ...(raw.reason ? { reason: raw.reason } : {}),
      ...(raw.providerEvidenceUri ? { providerEvidenceUri: raw.providerEvidenceUri } : {}),
    };
  }

  async signPades(request: ProviderSignRequest): Promise<ProviderSignResult> {
    const raw = await this.execute<SignWireResponse>({
      endpoint: request.tsa.endpoint || this.options.baseUrl,
      path: this.path('/tsa/sign'),
      idempotencyKey: request.idempotencyKey,
      circuitBreakerKey: 'pades-sign',
      headers: request.tsa.headers,
      body: {
        tenantId: request.tenantId,
        actorId: request.actorId,
        pdfBase64: Buffer.from(request.document).toString('base64'),
        documentSha256: request.documentSha256,
        algorithm: request.algorithm,
        digestAlgorithm: request.digestAlgorithm,
        tsa: {
          policyOid: request.tsa.policyOid,
          timeoutMs: request.tsa.timeoutMs,
        },
        certificate: serializeCertificate(request.certificate),
        certificatePem: request.certificate.pem,
        credential: request.credential,
        metadata: request.metadata,
      },
    });
    assertString(raw.signedPdfBase64, 'signedPdfBase64');
    return {
      signedDocument: Buffer.from(raw.signedPdfBase64, 'base64'),
      ...(raw.cmsSignatureBase64
        ? { cmsSignature: Buffer.from(raw.cmsSignatureBase64, 'base64') }
        : {}),
      ...(raw.signatureId ? { signatureId: raw.signatureId } : {}),
      ...(raw.signedAt ? { signedAt: parseDate(raw.signedAt, 'signedAt') } : {}),
      ...(raw.tsaTime ? { tsaTime: parseDate(raw.tsaTime, 'tsaTime') } : {}),
      ...(raw.certificateChainPem ? { certificateChainPem: raw.certificateChainPem } : {}),
      revocationSource: raw.revocationSource ? toRevocationSource(raw.revocationSource) : 'none',
      ...(raw.revocationCheckedAt
        ? { revocationCheckedAt: parseDate(raw.revocationCheckedAt, 'revocationCheckedAt') }
        : {}),
      ...(raw.providerEvidenceUri ? { providerEvidenceUri: raw.providerEvidenceUri } : {}),
    };
  }

  async verifyPades(request: ProviderVerifyRequest): Promise<VerifyResult> {
    const raw = await this.execute<VerifyWireResponse>({
      endpoint: this.options.baseUrl,
      path: this.path('/pades/verify'),
      circuitBreakerKey: 'pades-verify',
      body: {
        tenantId: request.tenantId,
        documentBase64: Buffer.from(request.document).toString('base64'),
        documentSha256: request.documentSha256,
        signedDocumentBase64: request.signedDocument
          ? Buffer.from(request.signedDocument).toString('base64')
          : undefined,
        cmsSignatureBase64: request.cmsSignature
          ? Buffer.from(request.cmsSignature).toString('base64')
          : undefined,
        policy: request.policy,
        metadata: request.metadata,
      },
    });
    if (raw.status !== 'valid' && raw.status !== 'invalid' && raw.status !== 'unknown') {
      throw new SignatureProviderResponseError('status must be valid, invalid, or unknown');
    }
    return {
      status: raw.status,
      documentSha256: request.documentSha256,
      checkedAt: parseDate(raw.checkedAt, 'checkedAt'),
      ...(raw.signerCertificate ? { signerCertificate: raw.signerCertificate } : {}),
      revocationSource: raw.revocationSource ? toRevocationSource(raw.revocationSource) : 'none',
      ...(raw.revocationCheckedAt
        ? { revocationCheckedAt: parseDate(raw.revocationCheckedAt, 'revocationCheckedAt') }
        : {}),
      ...(raw.certificateChainPem ? { certificateChainPem: raw.certificateChainPem } : {}),
      reasons: raw.reasons ?? [],
    };
  }

  private async execute<T>(input: HttpRequest): Promise<T> {
    try {
      return (await this.adapter.execute(input)) as T;
    } catch (error) {
      if (error instanceof SignatureProviderError) {
        throw error;
      }
      throw new SignatureProviderError(`Signature provider call failed: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }

  private async request(input: HttpRequest): Promise<unknown> {
    const baseUrl = input.endpoint ?? this.options.baseUrl;
    if (!baseUrl) {
      throw new SignatureProviderConfigurationError('Signature provider base URL is required');
    }
    const fetchFn = this.options.fetch ?? fetch;
    const response = await fetchFn(new URL(input.path, ensureTrailingSlash(baseUrl)), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.defaultHeaders,
        ...(input.headers ?? {}),
      },
      body: JSON.stringify(input.body),
    });
    if (!response.ok) {
      throw new SignatureProviderError(
        `Signature provider returned HTTP ${response.status} for ${input.path}`,
      );
    }
    return response.json();
  }

  private path(suffix: string): string {
    return `${this.pathPrefix}${suffix}`;
  }
}

function normalizePathPrefix(value: string): string {
  if (value === '') {
    return '';
  }
  return value.startsWith('/') ? value.replace(/\/$/, '') : `/${value.replace(/\/$/, '')}`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function serializeCertificate(certificate: SignatureCertificateRef): Record<string, unknown> {
  return {
    subject: certificate.subject,
    issuer: certificate.issuer,
    serialNumber: certificate.serialNumber,
    notBefore: certificate.notBefore?.toISOString(),
    notAfter: certificate.notAfter?.toISOString(),
  };
}

function toRevocationSource(source: UpperRevocationSource): RevocationSource {
  return source.toLowerCase() as RevocationSource;
}

function parseDate(value: string | undefined, field: string): Date {
  if (!value) {
    return new Date();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new SignatureProviderResponseError(`${field} is not a valid date`);
  }
  return date;
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SignatureProviderResponseError(`${field} must be a non-empty string`);
  }
}

function assertBoolean(value: unknown, field: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new SignatureProviderResponseError(`${field} must be a boolean`);
  }
}

function assertRevocationSource(value: unknown, field: string): asserts value is UpperRevocationSource {
  if (value !== 'OCSP' && value !== 'CRL' && value !== 'EMBEDDED' && value !== 'NONE') {
    throw new SignatureProviderResponseError(`${field} must be OCSP, CRL, EMBEDDED, or NONE`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
