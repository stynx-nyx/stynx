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
  if (!match) throw new Error('PDF has no terminal startxref');
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

function addAt(pdf: Uint8Array, at: number, addition: Uint8Array): Buffer {
  const original = Buffer.from(pdf);
  const expanded = Buffer.concat([original.subarray(0, at), addition, original.subarray(at)]);
  const oldOffset = lastStartXref(original);
  if (at < oldOffset) {
    const beforePointer = `startxref\n${oldOffset}\n`;
    const afterPointer = `startxref\n${oldOffset + addition.length}\n`;
    if (beforePointer.length !== afterPointer.length) throw new Error('startxref pointer width changed');
    const pointerAt = expanded.lastIndexOf(Buffer.from(beforePointer));
    if (pointerAt < 0) throw new Error('terminal startxref pointer absent');
    Buffer.from(afterPointer).copy(expanded, pointerAt);
  }
  return expanded;
}

function row(offset: number): string {
  return `${String(offset).padStart(10, '0')} 00000 n \n`;
}

describe('PDF trust remaining reachable branches', () => {
  it('rejects a valid incremental revision that skips the signed revision in /Prev', async () => {
    const signed = Buffer.from(bltSignedDocument);
    const signedEnd = revisionEnd(signed);
    const starts = [...signed.toString('latin1').slice(0, signedEnd)
      .matchAll(/startxref\s+(\d+)\s+%%EOF/g)];
    expect(starts.length).toBeGreaterThanOrEqual(2);
    const skippedRevision = Number(starts.at(-2)![1]);
    const revision = Buffer.from(listUpdatedCatalogInXref(signed));
    const latestPrevious = Number(/\/Prev\s+(\d+)/u.exec(revision.toString('latin1').slice(lastStartXref(revision)))![1]);
    const skippedText = String(skippedRevision).padStart(String(latestPrevious).length, '0');
    const attacked = replaceLast(revision, `/Prev ${latestPrevious}`, `/Prev ${skippedText}`);

    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toMatchObject({ name: 'SignatureTrustError', message: 'Post-signature modification' });
  });

  it('rejects a DSS entry whose value is PDF null instead of a dictionary', async () => {
    const revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const attacked = replaceLast(revision, '/DSS 8 0 R', '/DSS null ');

    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toMatchObject({ name: 'SignatureTrustError', message: 'Post-signature modification' });
  });

  it('rejects an xref subsection whose object number cannot be represented safely', async () => {
    const revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xrefOffset = lastStartXref(revision);
    const trailerAt = revision.indexOf(Buffer.from('trailer\n'), xrefOffset);
    expect(trailerAt).toBeGreaterThan(xrefOffset);
    const attacked = addAt(revision, trailerAt, Buffer.from('9007199254740992 0\n'));

    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toMatchObject({ name: 'SignatureTrustError', message: 'Post-signature modification' });
  });

  it('rejects an indexed stream that declares itself as an xref stream', async () => {
    const revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xrefOffset = lastStartXref(revision);
    const xrefHeader = Buffer.from('8 7\n');
    const headerAt = revision.indexOf(xrefHeader, xrefOffset);
    expect(headerAt).toBeGreaterThanOrEqual(0);
    const object10Offset = Number(revision.subarray(headerAt + xrefHeader.length + 2 * 20,
      headerAt + xrefHeader.length + 2 * 20 + 10).toString('ascii'));
    const objectEnd = revision.indexOf(Buffer.from('endobj'), object10Offset);
    const dictionaryEnd = revision.lastIndexOf(Buffer.from('>>'), objectEnd);
    expect(object10Offset).toBeGreaterThanOrEqual(0);
    expect(dictionaryEnd).toBeGreaterThan(object10Offset);

    const attacked = addAt(revision, dictionaryEnd,
      Buffer.from(' /Type /XRef /Root 1 0 R /Size 0 /W [0 0 0] /Index [0 0]'));
    const delta = Buffer.byteLength(' /Type /XRef /Root 1 0 R /Size 0 /W [0 0 0] /Index [0 0]');
    const attackedXref = lastStartXref(attacked);
    const attackedHeaderAt = attacked.indexOf(xrefHeader, attackedXref);
    const rowsAt = attackedHeaderAt + xrefHeader.length;
    // The new dictionary bytes move objects 11–14 and the xref table; object 10 stays put.
    for (let i = 3; i < 7; i += 1) {
      const fieldAt = rowsAt + i * 20;
      const offset = Number(attacked.subarray(fieldAt, fieldAt + 10).toString('ascii'));
      Buffer.from(String(offset + delta).padStart(10, '0')).copy(attacked, fieldAt);
    }

    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects overlapping xref intervals when an object header is hidden inside an evidence stream', async () => {
    let revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xrefOffset = lastStartXref(revision);
    const xrefHeader = Buffer.from('8 7\n');
    const headerAt = revision.indexOf(xrefHeader, xrefOffset);
    expect(headerAt).toBeGreaterThanOrEqual(0);
    const object10Offset = Number(revision.subarray(headerAt + xrefHeader.length + 2 * 20,
      headerAt + xrefHeader.length + 2 * 20 + 10).toString('ascii'));
    const streamAt = revision.indexOf(Buffer.from('stream\n'), object10Offset) + Buffer.byteLength('stream\n');
    const nestedObject = Buffer.from('15 0 obj\nnull\nendobj\n');
    expect(nestedObject).toHaveLength(21);
    expect(streamAt).toBeGreaterThan(object10Offset);
    nestedObject.copy(revision, streamAt);
    const nestedOffset = streamAt;
    const trailerAt = revision.indexOf(Buffer.from('trailer\n'), xrefOffset);
    expect(trailerAt).toBeGreaterThan(xrefOffset);
    const addition = Buffer.from(`15 1\n${row(nestedOffset)}`);
    revision = addAt(revision, trailerAt, addition);
    revision = replaceLast(revision, '/Size 15', '/Size 16');

    await expect(readPdfTrustEvidence(revision, revisionEnd(revision), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });
});
