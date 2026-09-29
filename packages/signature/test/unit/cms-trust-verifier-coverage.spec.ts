import {
  bltCmsSignature,
  bltSignedDocument,
  bltSourceDocument,
  certificate,
  now,
  profile,
  rootPem,
} from '../fixtures/trust';
import { createCmsTrustVerifier } from '../../src';

const signatureContentsStart = (pdf: Buffer): number => {
  const index = pdf.indexOf(Buffer.from('/Contents <', 'latin1'));
  if (index < 0) throw new Error('fixture has no signature Contents');
  return index + Buffer.byteLength('/Contents <');
};

const withCmsInContents = (cms: Uint8Array): Buffer => {
  const pdf = Buffer.from(bltSignedDocument);
  const start = signatureContentsStart(pdf);
  const end = pdf.indexOf('>'.charCodeAt(0), start);
  const fieldLength = end - start;
  const encoded = Buffer.from(cms).toString('hex');
  if (encoded.length > fieldLength) throw new Error('test CMS exceeds fixture placeholder');
  pdf.fill('0'.charCodeAt(0), start, end);
  pdf.write(encoded, start, 'latin1');
  return pdf;
};

const verifier = () => createCmsTrustVerifier({
  trustAnchorsPem: [rootPem],
  tsaTrustAnchorsPem: [rootPem],
  acceptedPolicies: profile.acceptedPolicies,
  now: () => now,
});

const input = (cmsSignature: Uint8Array, signedDocument: Uint8Array) => ({
  tenantId: 'tenant-a',
  originalDocument: bltSourceDocument,
  signedDocument,
  cmsSignature,
  certificate,
  profile,
});

describe('CMS trust verifier malformed-evidence boundaries', () => {
  it('rejects valid ASN.1 trailing bytes after the CMS ContentInfo', async () => {
    const cmsWithTrailingByte = Buffer.concat([Buffer.from(bltCmsSignature), Buffer.from([0])]);
    await expect(verifier().verifySignedArtifact(input(
      cmsWithTrailingByte,
      withCmsInContents(cmsWithTrailingByte),
    ))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'Invalid ASN.1 evidence',
    });
  });

  it('rejects a well-formed ContentInfo whose content type is not SignedData', async () => {
    // ContentInfo ::= SEQUENCE { contentType id-data, content [0] EXPLICIT ANY }
    const dataContentInfo = Buffer.from('300f06092a864886f70d010701a0020400', 'hex');
    await expect(verifier().verifySignedArtifact(input(
      dataContentInfo,
      withCmsInContents(dataContentInfo),
    ))).rejects.toMatchObject({
      name: 'SignatureTrustError',
      message: 'CMS SignedData required',
    });
  });

  it('ignores an unsafe malformed ByteRange candidate and selects the valid signed revision', async () => {
    const pdf = Buffer.from(bltSignedDocument);
    // Put the malformed candidate after the real one so PDF dictionary readers
    // continue to see the signed revision's actual ByteRange.
    const withInvalidCandidate = Buffer.concat([
      pdf,
      Buffer.from('\n% /ByteRange [0 9007199254740992 0 1]\n', 'latin1'),
    ]);
    await expect(verifier().verifySignedArtifact(input(
      bltCmsSignature,
      withInvalidCandidate,
    ))).rejects.toMatchObject({ name: expect.stringMatching(/^SignatureTrust/) });
  });
});
