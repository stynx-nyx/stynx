import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCmsTrustVerifier } from '../../src';
import {
  bltCmsSignature,
  bltSignedDocument,
  bltSourceDocument,
  certificate,
  now,
  profile,
  rootPem,
} from '../fixtures/trust';

const controls = vi.hoisted(() => ({ stripDssCerts: false }));

vi.mock('../../src/pdf-trust-evidence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/pdf-trust-evidence')>();
  return {
    ...actual,
    readPdfTrustEvidence: async (...args: Parameters<typeof actual.readPdfTrustEvidence>) => {
      const evidence = await actual.readPdfTrustEvidence(...args);
      return controls.stripDssCerts ? { ...evidence, certs: [] } : evidence;
    },
  };
});

const serialize = (value: asn1js.AsnType): Buffer => Buffer.from(value.toBER(false));

const rewriteTimestamp = (change: (tsa: pkijs.SignedData) => void): Buffer => {
  const source = Buffer.from(bltCmsSignature);
  const parsed = asn1js.fromBER(source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ));
  const contentInfo = new pkijs.ContentInfo({ schema: parsed.result });
  const signed = new pkijs.SignedData({ schema: contentInfo.content });
  const timestampAttribute = signed.signerInfos[0]!.unsignedAttrs?.attributes.find(
    (attribute) => attribute.type === '1.2.840.113549.1.9.16.2.14',
  );
  if (!timestampAttribute?.values[0]) throw new Error('Fixture CMS has no timestamp token');
  const token = new pkijs.ContentInfo({ schema: timestampAttribute.values[0] });
  const tsa = new pkijs.SignedData({ schema: token.content });
  change(tsa);
  token.content = tsa.toSchema();
  timestampAttribute.values = [token.toSchema()];
  return serialize(new pkijs.ContentInfo({
    contentType: pkijs.ContentInfo.SIGNED_DATA,
    content: signed.toSchema(),
  }).toSchema());
};

const rewriteImprint = (tsa: pkijs.SignedData, change: (tst: pkijs.TSTInfo) => void) => {
  const content = tsa.encapContentInfo.eContent;
  if (!content) throw new Error('Fixture timestamp token has no TSTInfo');
  const raw = Buffer.from(content.valueBlock.valueHexView);
  const parsed = asn1js.fromBER(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  const tst = new pkijs.TSTInfo({ schema: parsed.result });
  change(tst);
  const tstBytes = serialize(tst.toSchema());
  tsa.encapContentInfo.eContent = new asn1js.OctetString({
    valueHex: tstBytes.buffer.slice(tstBytes.byteOffset, tstBytes.byteOffset + tstBytes.byteLength),
  });
};

const makeInput = (cmsSignature: Uint8Array = bltCmsSignature) => {
  const signedDocument = Buffer.from(bltSignedDocument);
  const marker = signedDocument.indexOf(Buffer.from('/Contents <', 'latin1'));
  if (marker < 0) throw new Error('Fixture PDF has no signature Contents');
  const start = marker + Buffer.byteLength('/Contents <');
  const end = signedDocument.indexOf('>'.charCodeAt(0), start);
  const hex = Buffer.from(cmsSignature).toString('hex');
  if (hex.length > end - start) throw new Error('Mutated CMS exceeds fixture placeholder');
  signedDocument.fill('0'.charCodeAt(0), start, end);
  signedDocument.write(hex, start, 'latin1');
  return {
    tenantId: 'tenant-a',
    originalDocument: bltSourceDocument,
    signedDocument,
    cmsSignature,
    certificate,
    profile: { ...profile },
  };
};

const verifier = () => createCmsTrustVerifier({
  trustAnchorsPem: [rootPem],
  tsaTrustAnchorsPem: [rootPem],
  acceptedPolicies: profile.acceptedPolicies,
  now: () => now,
});

const originalVerify = pkijs.SignedData.prototype.verify;
type VerifyResult = Awaited<ReturnType<typeof pkijs.SignedData.prototype.verify>>;
type VerifyOptions = Parameters<typeof pkijs.SignedData.prototype.verify>[0];
type VerifyMode = 'tsa-short-path' | 'tsa-no-eku' | 'signer-short-path';

async function withVerifyMode<T>(mode: VerifyMode, action: () => Promise<T>): Promise<T> {
  const spy = vi.spyOn(pkijs.SignedData.prototype, 'verify').mockImplementation(
    async function (this: pkijs.SignedData, options?: VerifyOptions): Promise<VerifyResult> {
      const contentType = this.encapContentInfo.eContentType;
      const tsaContentType = '1.2.840.113549.1.9.16.1.4';
      if (options?.checkChain && contentType === tsaContentType) {
        const tsaCert = this.certificates.find((item) => item instanceof pkijs.Certificate);
        if (!(tsaCert instanceof pkijs.Certificate)) throw new Error('Fixture TSA certificate absent');
        if (mode === 'tsa-no-eku') {
          tsaCert.extensions = tsaCert.extensions?.filter((extension) => extension.extnID !== '2.5.29.37');
        }
        return {
          signatureVerified: true,
          signerCertificateVerified: true,
          signerCertificate: tsaCert,
          certificatePath: mode === 'tsa-short-path' ? [tsaCert] : [tsaCert, tsaCert],
        } as VerifyResult;
      }
      if (options?.checkChain && mode === 'signer-short-path' && contentType === '1.2.840.113549.1.7.1') {
        const signerCert = this.certificates.find((item) => item instanceof pkijs.Certificate &&
          item.serialNumber.valueBlock.toString() === '1001');
        if (!(signerCert instanceof pkijs.Certificate)) throw new Error('Fixture signer certificate absent');
        return {
          signatureVerified: true,
          signerCertificateVerified: true,
          signerCertificate: signerCert,
          certificatePath: [signerCert],
        } as VerifyResult;
      }
      return originalVerify.call(this, options);
    },
  );
  try {
    return await action();
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => {
  controls.stripDssCerts = false;
  vi.restoreAllMocks();
});

describe('CMS trust high-level coverage', () => {
  it('rejects a TSA-signed TSTInfo with an imprint that differs from the CMS signature', async () => {
    const cms = rewriteTimestamp((tsa) => rewriteImprint(tsa, (tst) => {
      tst.messageImprint.hashedMessage.valueBlock.valueHexView[0] ^= 1;
    }));
    await withVerifyMode('tsa-short-path', async () => {
      await expect(verifier().verifySignedArtifact(makeInput(cms))).rejects.toMatchObject({
        name: 'SignatureTrustError',
        message: 'TSA imprint or time invalid',
      });
    });
  });

  it('rejects a TSA certificate without the timeStamping EKU', async () => {
    await withVerifyMode('tsa-no-eku', async () => {
      await expect(verifier().verifySignedArtifact(makeInput())).rejects.toMatchObject({
        name: 'SignatureTrustError',
        message: 'TSA certificate lacks timeStamping EKU',
      });
    });
  });

  it('rejects a TSA certificate path that omits its issuer', async () => {
    await withVerifyMode('tsa-short-path', async () => {
      await expect(verifier().verifySignedArtifact(makeInput())).rejects.toMatchObject({
        name: 'SignatureTrustError',
        message: 'Certificate path incomplete',
      });
    });
  });

  it('rejects the signer when its validated path does not include an issuer', async () => {
    await withVerifyMode('signer-short-path', async () => {
      await expect(verifier().verifySignedArtifact(makeInput())).rejects.toMatchObject({
        name: 'SignatureTrustError',
        message: 'Signer certificate path invalid at selected time',
      });
    });
  });

  it('rejects PAdES-B-LT when signed revocation evidence is valid but archival certificates are absent', async () => {
    controls.stripDssCerts = true;
    await expect(verifier().verifySignedArtifact(makeInput())).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Embedded DSS evidence incomplete',
    });
  });

});
