import { createPublicKey } from 'node:crypto';
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

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCp8U3KXw/5+H55
D90QoKhctvaw6Pjc7ioJ+ITf5CpkIG9GzpC/nnRJOzpUY/na3kB/w8IvWv4ODZp1
NI43trVJhFwkVa4xWvMFQ0Zt0UxeFrqPEEobzME+R4eC4qio10ckMjWTfhbUKUvA
HlZWkolcfHnLvjeJZRIS8h38mCbYtguaePOx4PWXQXhixR15FInUBIGwvz7mUTX6
Vax/n9YWaxTJDQHv+RUhyVgPtLcQXMlfq9xBYnnjEaxpuSZQpG2CFQOnOMm5vbb/
vuxC8ogFXECtwaazY3VwjBOY++/KbJxepFZugNXuYRWh1prJ0ki1Iib4+wTsCRsb
L1PHNyaXAgMBAAECggEAEd8aeym8GGGVi02rxc/fZMCo+LnHUhSJvzqvXow0GQuA
KEYY2s3jFMBxxeYtpGKzDbycczZyeS/dCm5Ydmt0bSLKPdf01aPm4qrMgUf9a/ef
7uObp4jE2bPUAGOtsPPSu2+8SqJ77Bvbp3yJP9lxMJS2ikKavIwwdmWX2bR2gVuX
xen+k7Yt05IfhgTlbdl53A5PgtF73VAune9nJrOH+jX9jBJTWsikpOpysI1QMR7g
WLqUH0GVlvANkVsHeoM+SYdBu4tU0ykqSOUHDDGYAe93RzBnRe7lrJFx2TJZD4NQ
owqts0Zs1iyGiDuzczdGhDLoiUU0TakvoMiWcx1YYQKBgQDRy25RDHg2HLQcDsRX
AOFxo2JSUkhiASGFwtNmjpyLhYIYm2kxqvGmNNOZdBNPNo5UA0zSFjyuGjus9NiK
1ntMB7cHNttihE8npsBOhO1XNLAihgG4EtVl0xMsLeoK8JQrmoIs6jr5YHpTnjcA
PT5+uzGFZoZ+q9cJe/1/E8tpWwKBgQDPXvKyLvbhSh4b/RG70YkhymfPWHv2pNmq
C+aF5oNEHMwrf4LZvMh1G6Ws9tt42M0RFdYq76ctFXDyLkfWjdIIyQ5gLekzjz9o
MfGxKR8JKYqkhRGPATLZQWL5JkVd33o8hxfh+mNGneWxDE596e6BfWDtyTdAdhL3
2D2Y1cAAdQKBgQCtz3SeAU62xiER/cn8quYcV9hli3YcfANh5n9uQEjB7uJRsK/+
TjnWEX4dbGVzAyf3wqQqifHL7D/0kwW0QO31l46zk2c+v480spowc0CPNz+V2qAh
+LiDm9QOjhuQ5LBdT6z5uTUS1jOCg1neAN9972iftMlIuOV3Hhpu5d9ocQKBgHSE
jSnBaca8tp5TXBuEaOErsZi3xy+XARajCSxDkY48AByQ0R03Dgt/NWAydK86Yj8v
Xd9SOUUDvyrVBlhv54w4LHOuWFI4MxCAv6UjzeSACv7WJj+MFN4t90a3UlKktzI7
VhgLcKzFG8KXf6MQRotLv6LcZMc7kPzh6/psYC3hAoGBALPaoqTbWMSUAnOSpfPN
9jEnlcwZMkxegrflAfJyc54JsdlNZ8QfIYh+pU+1y76jIVmbQbQ5aOJ42Dk5IEUO
PwOzPVBT7Qn1Yp/E9yhcyZMDh8nlRChMXH7W8SmrclaBJnoi7swLQ4d/5MvB/Q4g
AeD0radngNT2NYlhRvTcbAUK
-----END PRIVATE KEY-----`;

const PUBLIC_KEY = createPublicKey(PRIVATE_KEY).export({
  format: 'pem',
  type: 'spki',
});

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
