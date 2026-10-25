import { IntegrationAdapter } from '@stynx-nyx/integration-adapter';
import {
  SignatureProviderConfigurationError,
  SignatureProviderError,
  SignatureProviderResponseError,
} from './errors.js';
import type {
  CertificateValidationRequest,
  CertificateValidationResult,
  HttpSignatureProviderOptions,
  ProviderSignRequest,
  ProviderSignResult,
  ProviderVerifyRequest,
  RevocationSource,
  SignatureCertificateRef,
  SignatureCertificateResult,
  VerifyResult,
} from './types.js';

type UpperRevocationSource = 'OCSP' | 'CRL' | 'EMBEDDED' | 'NONE';

interface HttpRequest {
  endpoint?: string | undefined;
  path: string;
  body: Record<string, unknown>;
  headers?: Record<string, string> | undefined;
  idempotencyKey?: string | undefined;
  circuitBreakerKey: string;
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
    const raw = await this.execute({
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
    assertBoolean(responseField(raw, 'good'), 'good');
    assertRevocationSource(responseField(raw, 'source'), 'source');
    return {
      good: booleanResult(responseField(raw, 'good'), 'good'),
      source: toRevocationSource(responseField(raw, 'source')),
      checkedAt: parseDate(responseField(raw, 'checkedAt'), 'checkedAt'),
      ...(responseField(raw, 'certificateChainPem')
        ? {
            certificateChainPem: optionalStringArrayResult(
              responseField(raw, 'certificateChainPem'),
              'certificateChainPem',
            ),
          }
        : {}),
      ...(responseField(raw, 'reason')
        ? { reason: stringResult(responseField(raw, 'reason'), 'reason') }
        : {}),
      ...(responseField(raw, 'providerEvidenceUri')
        ? {
            providerEvidenceUri: stringResult(
              responseField(raw, 'providerEvidenceUri'),
              'providerEvidenceUri',
            ),
          }
        : {}),
    };
  }

  async signPades(request: ProviderSignRequest): Promise<ProviderSignResult> {
    const raw = await this.execute({
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
    assertString(responseField(raw, 'signedPdfBase64'), 'signedPdfBase64');
    return {
      signedDocument: nativeBase64Buffer(responseField(raw, 'signedPdfBase64')),
      ...(responseField(raw, 'cmsSignatureBase64')
        ? { cmsSignature: nativeBase64Buffer(responseField(raw, 'cmsSignatureBase64')) }
        : {}),
      ...(responseField(raw, 'signatureId')
        ? { signatureId: stringResult(responseField(raw, 'signatureId'), 'signatureId') }
        : {}),
      ...(responseField(raw, 'signedAt')
        ? { signedAt: parseDate(responseField(raw, 'signedAt'), 'signedAt') }
        : {}),
      ...(responseField(raw, 'tsaTime')
        ? { tsaTime: parseDate(responseField(raw, 'tsaTime'), 'tsaTime') }
        : {}),
      ...(responseField(raw, 'certificateChainPem')
        ? {
            certificateChainPem: optionalStringArrayResult(
              responseField(raw, 'certificateChainPem'),
              'certificateChainPem',
            ),
          }
        : {}),
      revocationSource: responseField(raw, 'revocationSource')
        ? toRevocationSource(responseField(raw, 'revocationSource'))
        : 'none',
      ...(responseField(raw, 'revocationCheckedAt')
        ? {
            revocationCheckedAt: parseDate(
              responseField(raw, 'revocationCheckedAt'),
              'revocationCheckedAt',
            ),
          }
        : {}),
      ...(responseField(raw, 'providerEvidenceUri')
        ? {
            providerEvidenceUri: stringResult(
              responseField(raw, 'providerEvidenceUri'),
              'providerEvidenceUri',
            ),
          }
        : {}),
    };
  }

  async verifyPades(request: ProviderVerifyRequest): Promise<VerifyResult> {
    const raw = await this.execute({
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
    if (
      responseField(raw, 'status') !== 'valid' &&
      responseField(raw, 'status') !== 'invalid' &&
      responseField(raw, 'status') !== 'unknown'
    ) {
      throw new SignatureProviderResponseError('status must be valid, invalid, or unknown');
    }
    return {
      status: statusResult(responseField(raw, 'status')),
      documentSha256: request.documentSha256,
      checkedAt: parseDate(responseField(raw, 'checkedAt'), 'checkedAt'),
      ...(responseField(raw, 'signerCertificate')
        ? { signerCertificate: certificateResult(responseField(raw, 'signerCertificate')) }
        : {}),
      revocationSource: responseField(raw, 'revocationSource')
        ? toRevocationSource(responseField(raw, 'revocationSource'))
        : 'none',
      ...(responseField(raw, 'revocationCheckedAt')
        ? {
            revocationCheckedAt: parseDate(
              responseField(raw, 'revocationCheckedAt'),
              'revocationCheckedAt',
            ),
          }
        : {}),
      ...(responseField(raw, 'certificateChainPem')
        ? {
            certificateChainPem: optionalStringArrayResult(
              responseField(raw, 'certificateChainPem'),
              'certificateChainPem',
            ),
          }
        : {}),
      reasons: stringArrayResult(responseField(raw, 'reasons') ?? [], 'reasons'),
    };
  }

  private async execute(input: HttpRequest): Promise<unknown> {
    try {
      return await this.adapter.execute(input);
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

function toRevocationSource(source: unknown): RevocationSource {
  const lowerCase = responseField(source, 'toLowerCase');
  if (typeof lowerCase !== 'function') {
    throw new TypeError('source.toLowerCase is not a function');
  }
  const normalized: unknown = Reflect.apply(lowerCase, source, []);
  if (
    normalized === 'ocsp' ||
    normalized === 'crl' ||
    normalized === 'embedded' ||
    normalized === 'none'
  ) {
    return normalized;
  }
  throw new SignatureProviderResponseError(
    'revocationSource must normalize to ocsp, crl, embedded, or none',
  );
}

function parseDate(value: unknown, field: string): Date {
  if (!value) {
    return new Date();
  }
  // Exactly one native Date construction retains coercion and native failures.
  const date: unknown = Reflect.construct(Date, [value]);
  if (!(date instanceof Date))
    throw new TypeError('Native Date construction did not return a Date');
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

function assertRevocationSource(
  value: unknown,
  field: string,
): asserts value is UpperRevocationSource {
  if (value !== 'OCSP' && value !== 'CRL' && value !== 'EMBEDDED' && value !== 'NONE') {
    throw new SignatureProviderResponseError(`${field} must be OCSP, CRL, EMBEDDED, or NONE`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Preserve native property lookup on the unknown response, including primitive
 * boxing and the original receiver. The explicit nullish TypeError matches the
 * pinned Node class/message and first-read position, not its stack frames.
 */
function responseField(value: unknown, key: string): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  }
  const target: unknown = Object(value);
  if ((typeof target === 'object' && target !== null) || typeof target === 'function') {
    return Reflect.get(target, key, value);
  }
  throw new TypeError('Invalid signature response property target');
}

function nativeBase64Buffer(value: unknown): Buffer {
  const bytes: unknown = Reflect.apply(Buffer.from, Buffer, [value, 'base64']);
  if (!Buffer.isBuffer(bytes))
    throw new TypeError('Native Buffer conversion did not return a Buffer');
  return bytes;
}

function booleanResult(value: unknown, field: string): boolean {
  assertBoolean(value, field);
  return value;
}

function statusResult(value: unknown): VerifyResult['status'] {
  if (value !== 'valid' && value !== 'invalid' && value !== 'unknown') {
    throw new SignatureProviderResponseError('status must be valid, invalid, or unknown');
  }
  return value;
}

function stringResult(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new SignatureProviderResponseError(`${field} must be a string`);
  }
  return value;
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  const values: unknown[] = value;
  for (let index = 0; index < values.length; index += 1) {
    if (typeof values[index] !== 'string') return false;
  }
  return true;
}

function stringArrayResult(value: unknown, field: string): string[] {
  if (!isStringArray(value)) {
    throw new SignatureProviderResponseError(`${field} must be a string array`);
  }
  return value;
}

function isCertificateResult(value: unknown): value is SignatureCertificateResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  for (const key of ['subject', 'issuer', 'serialNumber', 'pem']) {
    const field: unknown = Reflect.get(value, key);
    if (field !== undefined && typeof field !== 'string') return false;
  }
  for (const key of ['notBefore', 'notAfter']) {
    const field: unknown = Reflect.get(value, key);
    if (field !== undefined && typeof field !== 'string' && !(field instanceof Date)) return false;
  }
  return true;
}

function certificateResult(value: unknown): SignatureCertificateResult | undefined {
  if (value === undefined) return undefined;
  if (!isCertificateResult(value)) {
    throw new SignatureProviderResponseError('signerCertificate has invalid descriptive fields');
  }
  return value;
}

function optionalStringArrayResult(value: unknown, field: string): string[] | undefined {
  return value === undefined ? undefined : stringArrayResult(value, field);
}
