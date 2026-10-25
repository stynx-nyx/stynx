import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  HttpSignatureProviderClient,
  ProviderBackedSignatureBackend,
  SignatureProviderResponseError,
  SignatureService,
  type ProviderSignRequest,
} from '../../src/index.js';

const iso = '2020-01-02T03:04:05.000Z';
const verifyRequest = { tenantId: 'tenant', document: Buffer.from('pdf'), documentSha256: 'hash' };
const signRequest: ProviderSignRequest = {
  ...verifyRequest,
  actorId: 'actor',
  algorithm: 'pades-ltv',
  digestAlgorithm: 'sha256',
  tsa: { endpoint: 'https://example.invalid' },
  certificate: { subject: 's', issuer: 'i', serialNumber: 'n' },
};
function controlled(raw: unknown) {
  let calls = 0;
  const client = new HttpSignatureProviderClient({
    baseUrl: 'https://example.invalid',
    retryPolicy: { maxAttempts: 1 },
    fetch: async () => {
      calls += 1;
      const response = new Response('{}');
      Object.defineProperty(response, 'json', { value: async () => raw });
      return response;
    },
  });
  return { client, calls: () => calls };
}
const prefix = 'Malformed signature provider response: ';

describe('approved Signature result boundaries', () => {
  it.each([
    [
      'certificate array',
      { signerCertificate: [] },
      'signerCertificate has invalid descriptive fields',
    ],
    [
      'certificate primitive',
      { signerCertificate: 7 },
      'signerCertificate has invalid descriptive fields',
    ],
    [
      'certificate named field',
      { signerCertificate: { subject: 7 } },
      'signerCertificate has invalid descriptive fields',
    ],
    [
      'sparse chain',
      { certificateChainPem: Array(1) },
      'certificateChainPem must be a string array',
    ],
    [
      'mixed chain',
      { certificateChainPem: ['pem', 7] },
      'certificateChainPem must be a string array',
    ],
    ['false reasons', { reasons: false }, 'reasons must be a string array'],
    ['zero reasons', { reasons: 0 }, 'reasons must be a string array'],
    ['empty-string reasons', { reasons: '' }, 'reasons must be a string array'],
  ])(
    'refuses %s at its response mapping without retry or data leakage',
    async (_name, fields, message) => {
      const { client, calls } = controlled({ status: 'valid', checkedAt: iso, ...fields });
      const error = await client.verifyPades(verifyRequest).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(SignatureProviderResponseError);
      expect(error).toHaveProperty('message', prefix + message);
      expect(calls()).toBe(1);
    },
  );

  it('refuses each newly bounded optional string at the original mapping position', async () => {
    for (const [method, field] of [
      ['sign', 'signatureId'],
      ['sign', 'providerEvidenceUri'],
      ['validate', 'reason'],
      ['validate', 'providerEvidenceUri'],
    ]) {
      let laterReads = 0;
      const raw =
        method === 'sign'
          ? { signedPdfBase64: 'cGRm', [field]: { secret: 'must not appear' } }
          : { good: true, source: 'OCSP', checkedAt: iso, [field]: { secret: 'must not appear' } };
      if (field !== 'providerEvidenceUri')
        Object.defineProperty(raw, 'providerEvidenceUri', {
          get() {
            laterReads++;
            throw Error('later field');
          },
        });
      const { client, calls } = controlled(raw);
      const operation =
        method === 'sign'
          ? client.signPades(signRequest)
          : client.validateCertificate({
              tenantId: 'tenant',
              actorId: 'actor',
              certificate: signRequest.certificate,
              allowCrlFallback: true,
            });
      const error = await operation.catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(SignatureProviderResponseError);
      expect(error).toHaveProperty('message', `${prefix}${field} must be a string`);
      expect(laterReads).toBe(0);
      expect(calls()).toBe(1);
    }
  });

  it('refuses unknown normalized revocation sources through the actual legacy service chain', async () => {
    const { client, calls } = controlled({
      status: 'valid',
      checkedAt: iso,
      revocationSource: 'mYsTeRy',
      reasons: [],
    });
    const result = new SignatureService(new ProviderBackedSignatureBackend(client)).verify({
      ...verifyRequest,
      documentSha256: createHash('sha256').update(verifyRequest.document).digest('hex'),
      signedDocument: Buffer.from('signed'),
    });
    await expect(result).rejects.toThrow(
      `${prefix}revocationSource must normalize to ocsp, crl, embedded, or none`,
    );
    expect(calls()).toBe(1);
  });

  it.each(['signerCertificate', 'certificateChainPem', 'signatureId', 'reason'])(
    'preserves a consumed undefined %s after a truthy condition read',
    async (field) => {
      let reads = 0;
      const raw = {
        status: 'valid',
        checkedAt: iso,
        reasons: [],
        signedPdfBase64: 'cGRm',
        good: true,
        source: 'OCSP',
      };
      Object.defineProperty(raw, field, {
        get() {
          expect(this).toBe(raw);
          return ++reads === 1 ? 'truthy' : undefined;
        },
      });
      const { client } = controlled(raw);
      const result =
        field === 'signatureId'
          ? await client.signPades(signRequest)
          : field === 'reason'
            ? await client.validateCertificate({
                tenantId: 'tenant',
                actorId: 'actor',
                certificate: signRequest.certificate,
                allowCrlFallback: true,
              })
            : await client.verifyPades(verifyRequest);
      expect(reads).toBe(2);
      expect(Object.hasOwn(result, field)).toBe(true);
      expect(Reflect.get(result, field)).toBeUndefined();
    },
  );

  it('checks the actually consumed second chain and status reads', async () => {
    for (const field of ['certificateChainPem', 'status']) {
      let reads = 0;
      const raw = { status: 'valid', checkedAt: iso, reasons: [] };
      Object.defineProperty(raw, field, {
        get() {
          return ++reads === 1
            ? field === 'status'
              ? 'valid'
              : ['pem']
            : field === 'status'
              ? 'broken'
              : 7;
        },
      });
      const { client, calls } = controlled(raw);
      await expect(client.verifyPades(verifyRequest)).rejects.toThrow(
        field === 'status'
          ? `${prefix}status must be valid, invalid, or unknown`
          : `${prefix}certificateChainPem must be a string array`,
      );
      expect(reads).toBe(2);
      expect(calls()).toBe(1);
    }
  });

  it('preserves required-field priority, nullish native errors and primitive lookup', async () => {
    let reads = 0;
    const raw = {
      status: 'broken',
      get signerCertificate() {
        reads++;
        throw Error('must not read');
      },
    };
    await expect(controlled(raw).client.verifyPades(verifyRequest)).rejects.toThrow(
      `${prefix}status must be valid, invalid, or unknown`,
    );
    expect(reads).toBe(0);
    await expect(controlled(null).client.verifyPades(verifyRequest)).rejects.toThrow(
      "Cannot read properties of null (reading 'status')",
    );
    await expect(controlled(7).client.verifyPades(verifyRequest)).rejects.toThrow(
      `${prefix}status must be valid, invalid, or unknown`,
    );
  });

  it('preserves proxy receiver, async assimilation reads and response property order', async () => {
    const trace: PropertyKey[] = [];
    const target = { status: 'valid', checkedAt: iso, reasons: [] };
    const proxy = new Proxy(target, {
      get(object, key, receiver) {
        expect(receiver).toBe(proxy);
        trace.push(key);
        return Reflect.get(object, key, receiver);
      },
    });
    const result = await controlled(proxy).client.verifyPades(verifyRequest);
    expect(trace).toEqual([
      ...Array(8).fill('then'),
      'status',
      'status',
      'checkedAt',
      'signerCertificate',
      'revocationSource',
      'revocationCheckedAt',
      'certificateChainPem',
      'reasons',
    ]);
    expect(result.reasons).toBe(target.reasons);
  });

  it('retains partial/inherited certificate fields, Date references, opaque extras and array identities', async () => {
    const date = new Date(iso),
      invalid = new Date(NaN);
    const certificate = Object.assign(Object.create({ subject: 'inherited' }), {
      notBefore: date,
      notAfter: invalid,
    });
    Object.defineProperty(certificate, 'opaque', {
      get() {
        throw Error('opaque field must not be inspected');
      },
    });
    const chain = ['pem'],
      reasons = ['reason'];
    const result = await controlled({
      status: 'valid',
      checkedAt: iso,
      signerCertificate: certificate,
      certificateChainPem: chain,
      reasons,
    }).client.verifyPades(verifyRequest);
    expect(result.signerCertificate).toBe(certificate);
    expect(result.signerCertificate?.notBefore).toBe(date);
    expect(result.signerCertificate?.notAfter).toBe(invalid);
    expect(result.certificateChainPem).toBe(chain);
    expect(result.reasons).toBe(reasons);
    const a = await controlled({
      status: 'valid',
      checkedAt: iso,
      reasons: null,
    }).client.verifyPades(verifyRequest);
    const b = await controlled({ status: 'valid', checkedAt: iso }).client.verifyPades(
      verifyRequest,
    );
    expect(a.reasons).toEqual([]);
    expect(b.reasons).toEqual([]);
    expect(a.reasons).not.toBe(b.reasons);
  });

  it('retains custom lowercase receiver and getter/call error identities', async () => {
    const trace: string[] = [];
    const source = {
      get toLowerCase() {
        trace.push('get');
        return function () {
          expect(this).toBe(source);
          trace.push('call');
          return 'crl';
        };
      },
    };
    const result = await controlled({
      status: 'valid',
      checkedAt: iso,
      revocationSource: source,
    }).client.verifyPades(verifyRequest);
    expect(result.revocationSource).toBe('crl');
    expect(trace).toEqual(['get', 'call']);
    const sentinel = new Error('original mapping failure');
    await expect(
      controlled({
        status: 'valid',
        checkedAt: iso,
        get signerCertificate() {
          throw sentinel;
        },
      }).client.verifyPades(verifyRequest),
    ).rejects.toBe(sentinel);
    await expect(
      controlled({
        status: 'valid',
        checkedAt: iso,
        revocationSource: {
          toLowerCase() {
            throw sentinel;
          },
        },
      }).client.verifyPades(verifyRequest),
    ).rejects.toBe(sentinel);
    await expect(
      controlled({ status: 'valid', checkedAt: iso, revocationSource: 3 }).client.verifyPades(
        verifyRequest,
      ),
    ).rejects.toThrow('source.toLowerCase is not a function');
  });

  it('retains native Date and Buffer conversion failures outside transport wrapping', async () => {
    await expect(
      controlled({ status: 'valid', checkedAt: Symbol('date') }).client.verifyPades(verifyRequest),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      controlled({ signedPdfBase64: 'cGRm', cmsSignatureBase64: 3 }).client.signPades(signRequest),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
