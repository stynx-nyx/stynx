import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  XMLDSIG_ALGORITHMS,
  XmlDSigInputError,
  XmlDSigSigner,
  XmlDSigVerificationError,
  XmlDSigVerifier,
  sha256,
} from '../../src';

// Ephemeral fixture keypair generated per test run — never hardcode key
// material in the repo, even throwaway fixtures (secret scanners rightly
// flag any PEM private key). RSASSA-PKCS1-v1_5 signatures are deterministic
// for a given key, so the determinism assertions below are unaffected.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const PRIVATE_KEY = privateKey
  .export({ format: 'pem', type: 'pkcs8' })
  .toString();

const PUBLIC_KEY = publicKey.export({ format: 'pem', type: 'spki' }).toString();

describe('XMLDSig signing and verification', () => {
  const verifier = new XmlDSigVerifier();

  it('signs XML deterministically with the fixture key', () => {
    const xml = '<evento Id="EVT-1"><total>100.00</total></evento>';
    const signedA = sign(xml);
    const signedB = sign(xml);

    expect(signedA).toBe(signedB);
    expect(sha256(signedA)).toBe(sha256(signedB));
    expect(signedA).toContain('<Signature ');
    expect(signedA).toContain('URI="#EVT-1"');
  });

  it('verifies a valid signed XML payload', () => {
    const signedXml = sign('<evento Id="EVT-2"><total>100.00</total></evento>');

    const result = verifier.verify(signedXml, {
      keys: [{ keyId: 'fixture', publicKeyPem: PUBLIC_KEY }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyId).toBe('fixture');
      expect(result.signatureCount).toBe(1);
    }
  });

  it('detects signed payload tampering with reference mismatches', () => {
    const signedXml = sign('<evento Id="EVT-3"><total>100.00</total></evento>');
    const tamperedXml = signedXml.replace(
      '<total>100.00</total>',
      '<total>101.00</total>',
    );

    const result = verifier.verify(tamperedXml, {
      keys: [{ publicKeyPem: PUBLIC_KEY }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('reference-digest-mismatch');
      expect(result.mismatches[0]).toMatchObject({
        reference: '#EVT-3',
        expected: expect.any(String),
        actual: expect.any(String),
      });
      expect(result.mismatches[0]?.expected).not.toBe(
        result.mismatches[0]?.actual,
      );
    }
  });

  it('round-trips DCTFWeb-shaped XML with an explicit declaration location', () => {
    const xml = fixture('dctfweb-sample.xml');
    const signedXml = sign(xml, {
      location: { reference: "//*[local-name(.)='declaracao']" },
    });

    expect(signedXml).toContain('<declaracao Id="DCTFWEB-2026-01">');
    expect(
      verifier.verify(signedXml, { keys: [{ publicKeyPem: PUBLIC_KEY }] }).ok,
    ).toBe(true);
  });

  it('round-trips EFD-Reinf-shaped XML with exclusive C14N', () => {
    const xml = fixture('efd-reinf-sample.xml');
    const signedXml = sign(xml, {
      canonicalizationAlgorithm: XMLDSIG_ALGORITHMS.canonicalization.exclusive,
    });

    expect(signedXml).toContain('<evtTotal Id="ID-R9000-2026-01">');
    expect(
      verifier.verify(signedXml, { keys: [{ publicKeyPem: PUBLIC_KEY }] }).ok,
    ).toBe(true);
  });

  it('throws descriptive errors for unsigned inputs and missing keys', () => {
    expect(() => sign('<evento><total>100.00</total></evento>')).toThrow(
      XmlDSigInputError,
    );

    const signedXml = sign('<evento Id="EVT-4"><total>100.00</total></evento>', {
      includeKeyInfo: false,
    });

    expect(() => verifier.verify(signedXml)).toThrow(XmlDSigVerificationError);
  });
});

function sign(
  xml: string,
  overrides: Partial<Parameters<XmlDSigSigner['sign']>[1]> = {},
): string {
  return new XmlDSigSigner().sign(xml, {
    key: { privateKeyPem: PRIVATE_KEY },
    ...overrides,
  });
}

function fixture(name: string): string {
  return readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');
}
