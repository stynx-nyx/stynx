import { describe, expect, it } from 'vitest';
import { SignatureTrustError } from '../../src/errors';
import { readPdfTrustEvidence } from '../../src/pdf-trust-evidence';
import { listUpdatedCatalogInXref } from '../fixtures/pki/xref-attacks';
import { bltCmsSignature, bltSignedDocument } from '../fixtures/trust';

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

const lastStartXref = (pdf: Buffer): number => {
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(pdf.toString('latin1'));
  if (!match) throw new Error('fixture has no terminal startxref');
  return Number(match[1]);
};

function replaceLast(pdf: Uint8Array, before: string, after: string): Buffer {
  if (before.length !== after.length) throw new Error('replacement must preserve byte offsets');
  const result = Buffer.from(pdf);
  const at = result.lastIndexOf(Buffer.from(before));
  if (at < 0) throw new Error(`PDF marker absent: ${before}`);
  Buffer.from(after).copy(result, at);
  return result;
}

function insertBeforeFinalXref(pdf: Uint8Array, addition: Uint8Array): Buffer {
  const original = Buffer.from(pdf);
  const xrefOffset = lastStartXref(original);
  const expanded = Buffer.concat([
    original.subarray(0, xrefOffset), Buffer.from(addition), original.subarray(xrefOffset),
  ]);
  const oldPointer = `startxref\n${xrefOffset}\n`;
  const newPointer = `startxref\n${xrefOffset + addition.length}\n`;
  if (oldPointer.length !== newPointer.length) throw new Error('xref pointer width changed');
  const pointerAt = expanded.lastIndexOf(Buffer.from(oldPointer));
  if (pointerAt < 0) throw new Error('terminal startxref pointer absent');
  Buffer.from(newPointer).copy(expanded, pointerAt);
  return expanded;
}

describe('PDF final xref integrity', () => {
  it('rejects a signed PDF whose xref startxref marker is missing', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const marker = Buffer.from('startxref');
    let at = 0;
    while ((at = pdf.indexOf(marker, at)) >= 0) {
      Buffer.from('startxreF').copy(pdf, at);
      at += marker.length;
    }

    await expect(readPdfTrustEvidence(pdf, revisionEnd(pdf), bltCmsSignature))
      .rejects.toMatchObject({ message: 'Post-signature modification' });
  });

  it('rejects an xref subsection whose header is malformed', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xrefOffset = lastStartXref(pdf);
    const subsection = Buffer.from('8 7\n');
    const at = pdf.indexOf(subsection, xrefOffset);
    expect(at).toBeGreaterThanOrEqual(0);
    Buffer.from('x 7\n').copy(pdf, at);

    await expect(readPdfTrustEvidence(pdf, revisionEnd(pdf), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects an xref row whose offset does not contain the referenced object header', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xrefOffset = lastStartXref(pdf);
    const subsection = Buffer.from('8 7\n');
    const at = pdf.indexOf(subsection, xrefOffset);
    expect(at).toBeGreaterThanOrEqual(0);
    const rowAt = at + subsection.length;
    const object9Offset = Number(pdf.subarray(rowAt + 20, rowAt + 30).toString('ascii'));
    Buffer.from(String(object9Offset).padStart(10, '0')).copy(pdf, rowAt);

    await expect(readPdfTrustEvidence(pdf, revisionEnd(pdf), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects indirect objects found by PDF parsing but omitted from the effective xref', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const rogue = Buffer.from('20 0 obj\n(null)\nendobj\n');
    const attacked = insertBeforeFinalXref(pdf, rogue);

    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects an xref trailer with non-whitespace between trailer and startxref', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const attacked = replaceLast(pdf, '>>\nstartxref\n', '>>%startxref\n');

    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects a trailer that redirects Root away from the original catalog reference', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const attacked = replaceLast(pdf, '/Root 1 0 R /Prev', '/Root 8 0 R /Prev');

    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects a catalog revision that changes a preexisting page-tree binding', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xrefOffset = lastStartXref(pdf);
    const catalogRowAt = xrefOffset + Buffer.byteLength('xref\n1 1\n');
    const catalogOffset = Number(pdf.subarray(catalogRowAt, catalogRowAt + 10).toString('ascii'));
    const objectAt = pdf.indexOf(Buffer.from('/Pages 2 0 R'), catalogOffset);
    expect(objectAt).toBeGreaterThanOrEqual(catalogOffset);
    Buffer.from('/Pages 8 0 R').copy(pdf, objectAt);

    await expect(readPdfTrustEvidence(pdf, revisionEnd(pdf), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });
});
