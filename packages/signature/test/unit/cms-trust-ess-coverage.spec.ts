import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
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

const cmsInput = (cmsSignature: Uint8Array) => {
  const signedDocument = Buffer.from(bltSignedDocument);
  const contentsMarker = Buffer.from('/Contents <', 'latin1');
  const marker = signedDocument.indexOf(contentsMarker);
  if (marker < 0) throw new Error('PAdES fixture has no Contents placeholder');
  const start = marker + contentsMarker.length;
  const end = signedDocument.indexOf('>'.charCodeAt(0), start);
  const placeholderLength = end - start;
  const encodedCms = Buffer.from(cmsSignature).toString('hex');
  if (encodedCms.length > placeholderLength) throw new Error('Mutated CMS exceeds fixture placeholder');
  signedDocument.fill('0'.charCodeAt(0), start, end);
  signedDocument.write(encodedCms, start, 'latin1');
  return {
    tenantId: 'tenant-a',
    originalDocument: bltSourceDocument,
    signedDocument,
    cmsSignature,
    certificate,
    profile,
  };
};

const rewriteCms = (change: (signed: pkijs.SignedData) => void): Buffer => {
  const source = Buffer.from(bltCmsSignature);
  const parsed = asn1js.fromBER(source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ));
  if (parsed.offset !== source.length) throw new Error('Fixture CMS is not a complete ASN.1 value');
  const contentInfo = new pkijs.ContentInfo({ schema: parsed.result });
  const signed = new pkijs.SignedData({ schema: contentInfo.content });
  change(signed);
  return Buffer.from(new pkijs.ContentInfo({
    contentType: pkijs.ContentInfo.SIGNED_DATA,
    content: signed.toSchema(),
  }).toSchema().toBER(false));
};

const verifier = () => createCmsTrustVerifier({
  trustAnchorsPem: [rootPem],
  tsaTrustAnchorsPem: [rootPem],
  acceptedPolicies: profile.acceptedPolicies,
  now: () => now,
});

const findAttribute = (signed: pkijs.SignedData, oid: string) => {
  const signer = signed.signerInfos[0];
  if (!signer?.signedAttrs) throw new Error('Fixture CMS has no signed attributes');
  const attribute = signer.signedAttrs.attributes.find((candidate) => candidate.type === oid);
  if (!attribute) throw new Error(`Fixture CMS is missing attribute ${oid}`);
  return attribute;
};

describe('CMS SignedData and ESS signer binding boundaries', () => {
  it.each([
    ['no SignerInfo', (signed: pkijs.SignedData) => { signed.signerInfos.length = 0; }],
    ['no signed attributes', (signed: pkijs.SignedData) => {
      signed.signerInfos[0]!.signedAttrs = undefined;
    }],
  ])('rejects a SignedData object with %s', async (_name, change) => {
    const cms = rewriteCms(change);
    await expect(verifier().verifySignedArtifact(cmsInput(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'CMS signed attributes missing',
    });
  });

  it('rejects a signed content-type attribute that is not id-data', async () => {
    const cms = rewriteCms((signed) => {
      findAttribute(signed, '1.2.840.113549.1.9.3').values = [
        new asn1js.ObjectIdentifier({ value: '1.2.3.4' }),
      ];
    });
    await expect(verifier().verifySignedArtifact(cmsInput(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Signed CMS content type is not id-data',
    });
  });

  it('rejects a CMS SignedData without ESS signer-certificate binding', async () => {
    const cms = rewriteCms((signed) => {
      const signer = signed.signerInfos[0]!;
      signer.signedAttrs!.attributes = signer.signedAttrs!.attributes.filter(
        (attribute) => attribute.type !== '1.2.840.113549.1.9.16.2.47',
      );
    });
    await expect(verifier().verifySignedArtifact(cmsInput(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Signed signer-certificate binding absent',
    });
  });

  it('rejects a malformed ESS value before attempting CMS signature verification', async () => {
    const cms = rewriteCms((signed) => {
      findAttribute(signed, '1.2.840.113549.1.9.16.2.47').values = [
        new asn1js.OctetString({ valueHex: new ArrayBuffer(0) }),
      ];
    });
    await expect(verifier().verifySignedArtifact(cmsInput(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'SigningCertificateV2 malformed',
    });
  });

  it.each([
    ['missing certificate list', new asn1js.Sequence()],
    ['empty certificate list', new asn1js.Sequence({ value: [new asn1js.Sequence()] })],
  ])('rejects ESS with a %s', async (_label, essValue) => {
    const cms = rewriteCms((signed) => {
      findAttribute(signed, '1.2.840.113549.1.9.16.2.47').values = [essValue];
    });
    await expect(verifier().verifySignedArtifact(cmsInput(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'SigningCertificateV2 first certificate differs from signer',
    });
  });

  it('rejects an explicitly encoded ESS hash algorithm other than SHA-256', async () => {
    const cms = rewriteCms((signed) => {
      const ess = findAttribute(signed, '1.2.840.113549.1.9.16.2.47');
      const outer = ess.values[0];
      if (!(outer instanceof asn1js.Sequence)) throw new Error('Fixture ESS value is not a sequence');
      const certs = outer.valueBlock.value[0];
      if (!(certs instanceof asn1js.Sequence)) throw new Error('Fixture ESS cert list is not a sequence');
      const first = certs.valueBlock.value[0];
      if (!(first instanceof asn1js.Sequence)) throw new Error('Fixture ESSCertIDv2 is not a sequence');
      const certHash = first.valueBlock.value.find((field) => field instanceof asn1js.OctetString);
      if (!(certHash instanceof asn1js.OctetString)) throw new Error('Fixture ESS cert hash is absent');
      ess.values = [new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [new asn1js.Sequence({
        value: [new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: '1.3.14.3.2.26' }), new asn1js.Null()] }), certHash],
      })] })] })];
    });
    await expect(verifier().verifySignedArtifact(cmsInput(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'SigningCertificateV2 hash algorithm invalid',
    });
  });

  it('accepts an explicit SHA-256 ESS hash declaration without optional issuerSerial', async () => {
    const cms = rewriteCms((signed) => {
      const ess = findAttribute(signed, '1.2.840.113549.1.9.16.2.47');
      const outer = ess.values[0];
      if (!(outer instanceof asn1js.Sequence)) throw new Error('Fixture ESS value is not a sequence');
      const certs = outer.valueBlock.value[0];
      if (!(certs instanceof asn1js.Sequence)) throw new Error('Fixture ESS cert list is not a sequence');
      const first = certs.valueBlock.value[0];
      if (!(first instanceof asn1js.Sequence)) throw new Error('Fixture ESSCertIDv2 is not a sequence');
      const certHash = first.valueBlock.value.find((field) => field instanceof asn1js.OctetString);
      if (!(certHash instanceof asn1js.OctetString)) throw new Error('Fixture ESS cert hash is absent');
      ess.values = [new asn1js.Sequence({ value: [new asn1js.Sequence({ value: [new asn1js.Sequence({
        value: [new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: '2.16.840.1.101.3.4.2.1' }), new asn1js.Null()] }), certHash],
      })] })] })];
    });
    await expect(verifier().verifySignedArtifact(cmsInput(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'CMS signer identity differs from supplied certificate',
    });
  });

  it('rejects an ESS issuerSerial that does not identify the supplied signer', async () => {
    const cms = rewriteCms((signed) => {
      const ess = findAttribute(signed, '1.2.840.113549.1.9.16.2.47');
      const original = ess.values[0];
      if (!(original instanceof asn1js.Sequence)) throw new Error('Fixture ESS value is not a sequence');
      const certs = original.valueBlock.value[0];
      if (!(certs instanceof asn1js.Sequence)) throw new Error('Fixture ESS cert list is not a sequence');
      const first = certs.valueBlock.value[0];
      if (!(first instanceof asn1js.Sequence)) throw new Error('Fixture ESSCertIDv2 is not a sequence');
      const certHash = first.valueBlock.value.find((field) => field instanceof asn1js.OctetString);
      if (!(certHash instanceof asn1js.OctetString)) throw new Error('Fixture ESS cert hash is absent');
      ess.values = [new asn1js.Sequence({
        value: [new asn1js.Sequence({ value: [new asn1js.Sequence({
          value: [certHash, new asn1js.Sequence({ value: [new asn1js.Sequence(), new asn1js.Integer({ value: 2 })] })],
        })] })],
      })];
    });
    await expect(verifier().verifySignedArtifact(cmsInput(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'SigningCertificateV2 issuerSerial differs from signer',
    });
  });
});
