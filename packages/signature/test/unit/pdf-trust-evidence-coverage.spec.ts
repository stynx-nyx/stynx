import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { SignatureTrustError, SignatureTrustUnavailableError } from '../../src/errors';
import {
  readPdfTrustEvidence, readSelectedSignatureDictionary, readWithdrawalSourceBinding,
} from '../../src/pdf-trust-evidence';
import { buildManifestBoundPades } from '../fixtures/pki/bound-pades';
import {
  appendCatalogShadow, appendDuplicatePrev, appendHybridXref, listUpdatedCatalogInXref,
} from '../fixtures/pki/xref-attacks';
import { bltCmsSignature, bltSignedDocument, bytes } from '../fixtures/trust';

const byteRange = (pdf: Uint8Array): number[] => {
  const match = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/u
    .exec(Buffer.from(pdf).toString('latin1'));
  if (!match) throw new Error('fixture has no signature ByteRange');
  return match.slice(1).map(Number);
};
const revisionEnd = (pdf: Uint8Array): number => {
  const [, , secondOffset, secondLength] = byteRange(pdf);
  return secondOffset! + secondLength!;
};

describe('PDF trust evidence reader', () => {
  it('returns no post-signature evidence when the requested revision is the complete PDF', async () => {
    await expect(readPdfTrustEvidence(bltSignedDocument, bltSignedDocument.length, bltCmsSignature)).resolves.toEqual({
      certs: [], ocsp: [], crls: [], vriOcsp: [], vriCrls: [],
    });
  });

  it('reads bound DSS streams from a valid incremental revision and accepts VRI fallback to global OCSP/CRL', async () => {
    const signed = listUpdatedCatalogInXref(bltSignedDocument);
    const evidence = await readPdfTrustEvidence(signed, revisionEnd(signed), bltCmsSignature);
    expect(evidence.certs.length).toBeGreaterThan(0);
    expect(evidence.ocsp.length).toBeGreaterThan(0);
    expect(evidence.crls.length).toBeGreaterThan(0);
    expect(evidence.vriOcsp).toEqual(evidence.ocsp);
    expect(evidence.vriCrls).toEqual(evidence.crls);
  });

  it.each([
    ['catalog shadow', appendCatalogShadow],
    ['duplicate trailer Prev', appendDuplicatePrev],
    ['hybrid xref', (pdf: Uint8Array) => appendHybridXref(pdf, 1)],
  ])('rejects %s revisions that alter effective trust evidence', async (_label, attack) => {
    const signed = attack(bltSignedDocument);
    await expect(readPdfTrustEvidence(signed, revisionEnd(signed), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects malformed PDFs and identifies valid unsupported xref formats as unavailable', async () => {
    await expect(readPdfTrustEvidence(Buffer.from('not a PDF'), 1, bltCmsSignature))
      .rejects.toMatchObject({ name: 'SignatureTrustError', message: 'Post-signature modification' });
    for (const stem of ['pades-xref-stream', 'pades-hybrid-xref']) {
      const pdf = bytes(`${stem}-blt.pdf`);
      await expect(readPdfTrustEvidence(pdf, revisionEnd(pdf), bytes(`${stem}-blt.cms.der`)))
        .rejects.toBeInstanceOf(SignatureTrustUnavailableError);
    }
  });

  it('rejects DSS arrays whose members are dictionaries instead of evidence streams', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const marker = Buffer.from('/Certs [10 0 R 14 0 R]');
    const at = pdf.lastIndexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    // Put a PDF null in the first certificate slot while keeping the
    // incremental xref offsets intact.
    Buffer.from('/Certs [null   14 0 R]').copy(pdf, at);
    await expect(readPdfTrustEvidence(pdf, revisionEnd(pdf), bltCmsSignature))
      .rejects.toMatchObject({ message: 'DSS evidence is not a PDF stream' });
  });

  it('rejects an evidence stream with a nonnumeric direct Length value', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const marker = Buffer.from('10 0 obj\n<< /Length 840 >>');
    const at = pdf.indexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    Buffer.from('10 0 obj\n<< /Length (x) >>').copy(pdf, at);
    await expect(readPdfTrustEvidence(pdf, revisionEnd(pdf), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('selects only the signature dictionary matching both ByteRange and CMS bytes', async () => {
    const pdf = bltSignedDocument;
    const range = byteRange(pdf);
    await expect(readSelectedSignatureDictionary(pdf, revisionEnd(pdf), range, bltCmsSignature))
      .resolves.toEqual({});
    await expect(readSelectedSignatureDictionary(pdf, revisionEnd(pdf), [0, 1, 2, 3], bltCmsSignature))
      .rejects.toMatchObject({ message: 'Selected PDF signature dictionary missing or ambiguous' });
    await expect(readSelectedSignatureDictionary(pdf, revisionEnd(pdf), range, Buffer.from('not the CMS')))
      .rejects.toMatchObject({ message: 'Selected PDF signature dictionary missing or ambiguous' });
    await expect(readSelectedSignatureDictionary(Buffer.from('bad PDF'), 8, range, bltCmsSignature))
      .rejects.toMatchObject({ message: 'Signed PDF signature dictionary invalid' });

    const detached = bytes('pades-signed.pdf');
    await expect(readSelectedSignatureDictionary(detached, revisionEnd(detached), byteRange(detached), bytes('pades.cms.der')))
      .rejects.toMatchObject({ message: 'CAdES PAdES subfilter absent' });
  });

  it('reads valid manifest binding and rejects malformed binding text', async () => {
    const manifest = 'a'.repeat(64);
    const artifact = buildManifestBoundPades(manifest);
    const good = await readSelectedSignatureDictionary(artifact.signedDocument, revisionEnd(artifact.signedDocument),
      byteRange(artifact.signedDocument), artifact.cmsSignature);
    expect(good).toEqual({ manifest });

    const changed = Buffer.from(artifact.signedDocument);
    const marker = Buffer.from(`/STYNXManifestSHA256 (${manifest})`);
    const at = changed.indexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    changed[at + marker.length - 2] = 'z'.charCodeAt(0);
    await expect(readSelectedSignatureDictionary(changed, revisionEnd(changed), byteRange(changed), artifact.cmsSignature))
      .rejects.toMatchObject({ message: 'Signed manifest binding malformed' });
  });

  it('reads an optional withdrawal digest and treats malformed or absent values as unbound', async () => {
    await expect(readWithdrawalSourceBinding(bytes('withdrawal-source.pdf')))
      .resolves.toMatch(/^[0-9a-f]{64}$/u);
    const plain = await PDFDocument.create();
    plain.addPage();
    await expect(readWithdrawalSourceBinding(await plain.save())).resolves.toBeUndefined();
    plain.catalog.set(PDFName.of('STYNXWithdrawalSHA256'), PDFString.of('bad-digest'));
    await expect(readWithdrawalSourceBinding(await plain.save())).resolves.toBeUndefined();
    await expect(readWithdrawalSourceBinding(Buffer.from('not a PDF')))
      .rejects.toMatchObject({ message: 'Withdrawal source PDF invalid' });
  });
});
