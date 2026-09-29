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

const serialize = (value: asn1js.AsnType): Buffer => Buffer.from(value.toBER(false));

const rewriteMainCms = (change: (signed: pkijs.SignedData) => void): Buffer => {
  const source = Buffer.from(bltCmsSignature);
  const parsed = asn1js.fromBER(source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ));
  const contentInfo = new pkijs.ContentInfo({ schema: parsed.result });
  const signed = new pkijs.SignedData({ schema: contentInfo.content });
  change(signed);
  return serialize(new pkijs.ContentInfo({
    contentType: pkijs.ContentInfo.SIGNED_DATA,
    content: signed.toSchema(),
  }).toSchema());
};

const rewriteTimestamp = (change: (tsa: pkijs.SignedData) => void): Buffer => {
  return rewriteMainCms((signed) => {
    const signer = signed.signerInfos[0]!;
    const timestampAttribute = signer.unsignedAttrs?.attributes.find(
      (attribute) => attribute.type === '1.2.840.113549.1.9.16.2.14',
    );
    if (!timestampAttribute?.values[0]) throw new Error('Fixture CMS has no timestamp token');
    const token = new pkijs.ContentInfo({ schema: timestampAttribute.values[0] });
    const tsa = new pkijs.SignedData({ schema: token.content });
    change(tsa);
    token.content = tsa.toSchema();
    timestampAttribute.values = [token.toSchema()];
  });
};

const input = (cmsSignature: Uint8Array, profileOverride: Record<string, unknown> = {}) => {
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
    profile: { ...profile, ...profileOverride },
  };
};

const verifier = (overrides: Record<string, unknown> = {}) => createCmsTrustVerifier({
  trustAnchorsPem: [rootPem],
  tsaTrustAnchorsPem: [rootPem],
  acceptedPolicies: profile.acceptedPolicies,
  now: () => now,
  ...overrides,
});

const replaceTstInfo = (tsa: pkijs.SignedData, change: (tst: pkijs.TSTInfo) => void) => {
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

describe('CMS timestamp trust boundaries', () => {
  it.each([
    ['missing', (signed: pkijs.SignedData) => {
      signed.signerInfos[0]!.signedAttrs!.attributes = signed.signerInfos[0]!.signedAttrs!.attributes
        .filter((attribute) => attribute.type !== '1.2.840.113549.1.9.5');
    }],
    ['invalid', (signed: pkijs.SignedData) => {
      const signingTime = signed.signerInfos[0]!.signedAttrs!.attributes.find(
        (attribute) => attribute.type === '1.2.840.113549.1.9.5',
      );
      if (!signingTime) throw new Error('Fixture CMS has no signing-time attribute');
      signingTime.values = [new asn1js.GeneralizedTime({ valueDate: new Date(0) })];
    }],
  ])('rejects a %s CMS signing time', async (_label, change) => {
    const cms = rewriteMainCms(change);
    await expect(verifier().verifySignedArtifact(input(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'CMS signed signing time absent',
    });
  });

  it('uses profile policy first, then empty policy defaults and verifier TSA anchors as fallback', async () => {
    const cmsVerifier = createCmsTrustVerifier({ trustAnchorsPem: [rootPem], now: () => now });
    const result = await cmsVerifier.verifySignedArtifact(input(bltCmsSignature, {
      acceptedPolicies: undefined,
    }));
    expect(result).toMatchObject({ verifierKind: 'stynx-cms', padesProfile: 'PAdES-B-LT' });
  });

  it('rejects an embedded timestamp CMS without TSTInfo content', async () => {
    const cms = rewriteTimestamp((tsa) => { tsa.encapContentInfo.eContent = undefined; });
    await expect(verifier().verifySignedArtifact(input(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'TSA imprint absent',
    });
  });

  it('rejects an invalid TST generation time before checking the timestamp signature', async () => {
    const cms = rewriteTimestamp((tsa) => replaceTstInfo(tsa, (tst) => { tst.genTime = new Date(0); }));
    await expect(verifier().verifySignedArtifact(input(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'TSA generation time invalid',
    });
  });

  it('rejects a timestamp token with a corrupted signature', async () => {
    const cms = rewriteTimestamp((tsa) => {
      const signature = tsa.signerInfos[0]!.signature.valueBlock.valueHexView;
      signature[0] = signature[0]! ^ 1;
    });
    await expect(verifier().verifySignedArtifact(input(cms))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'TSA signature invalid',
    });
  });

});
