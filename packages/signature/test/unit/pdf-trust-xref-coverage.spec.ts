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

function addDeepDssMember(pdf: Uint8Array): Buffer {
  const original = Buffer.from(pdf);
  const xrefOffset = lastStartXref(original);
  const rowHeader = Buffer.from('8 7\n');
  const rowHeaderAt = original.indexOf(rowHeader, xrefOffset);
  if (rowHeaderAt < 0) throw new Error('incremental DSS xref subsection absent');
  const dssOffsetAt = rowHeaderAt + rowHeader.length;
  const dssOffset = Number(original.subarray(dssOffsetAt, dssOffsetAt + 10).toString('ascii'));
  const dssHeader = Buffer.from('8 0 obj');
  if (original.subarray(dssOffset, dssOffset + dssHeader.length).compare(dssHeader) !== 0)
    throw new Error('incremental DSS object offset is invalid');
  const objectEnd = original.indexOf(Buffer.from('\nendobj'), dssOffset);
  const closeDict = original.lastIndexOf(Buffer.from('>>'), objectEnd);
  if (objectEnd < 0 || closeDict < dssOffset) throw new Error('incremental DSS dictionary is malformed');

  let nested = 'null';
  for (let depth = 0; depth < 36; depth += 1) nested = `<< /n ${nested} >>`;
  const insertion = Buffer.from(` /CoverageDepth ${nested}`);
  const expanded = Buffer.concat([
    original.subarray(0, closeDict), insertion, original.subarray(closeDict),
  ]);
  const delta = insertion.length;
  const catalogRowAt = xrefOffset + delta + Buffer.byteLength('xref\n1 1\n');
  const catalogOffset = Number(expanded.subarray(catalogRowAt, catalogRowAt + 10).toString('ascii'));
  Buffer.from(String(catalogOffset + delta).padStart(10, '0')).copy(expanded, catalogRowAt);
  const xrefHeaderAt = expanded.indexOf(rowHeader, xrefOffset + delta);
  const rowsAt = xrefHeaderAt + rowHeader.length;
  // Objects 9–14 occur after DSS object 8 and moved by exactly `delta`.
  for (let rowIndex = 1; rowIndex < 7; rowIndex += 1) {
    const fieldAt = rowsAt + rowIndex * 20;
    const oldOffset = Number(expanded.subarray(fieldAt, fieldAt + 10).toString('ascii'));
    Buffer.from(String(oldOffset + delta).padStart(10, '0')).copy(expanded, fieldAt);
  }
  const oldXrefText = `startxref\n${xrefOffset}\n`;
  const newXrefText = `startxref\n${xrefOffset + delta}\n`;
  if (oldXrefText.length !== newXrefText.length) throw new Error('xref offset width changed unexpectedly');
  const terminalAt = expanded.lastIndexOf(Buffer.from(oldXrefText));
  if (terminalAt < 0) throw new Error('terminal startxref marker absent');
  Buffer.from(newXrefText).copy(expanded, terminalAt);
  return expanded;
}

describe('PDF xref and DSS branch coverage', () => {
  it('fails closed when an xref row has an unsupported entry marker', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xrefOffset = lastStartXref(pdf);
    const subsection = Buffer.from('8 7\n');
    const subsectionAt = pdf.indexOf(subsection, xrefOffset);
    expect(subsectionAt).toBeGreaterThanOrEqual(0);
    const firstRowAt = subsectionAt + subsection.length;
    const statusAt = firstRowAt + Buffer.byteLength('0000000000 00000 ');
    expect(pdf[statusAt]).toBe('n'.charCodeAt(0));
    pdf[statusAt] = 'z'.charCodeAt(0);

    await expect(readPdfTrustEvidence(pdf, revisionEnd(pdf), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects a raw evidence stream whose declared length differs from its bytes', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const marker = Buffer.from('10 0 obj\n<< /Length ');
    const objectAt = pdf.lastIndexOf(marker);
    expect(objectAt).toBeGreaterThanOrEqual(0);
    const lengthAt = objectAt + marker.length;
    const lengthEnd = pdf.indexOf(Buffer.from(' >>'), lengthAt);
    expect(lengthEnd).toBeGreaterThan(lengthAt);
    const oldLengthText = pdf.subarray(lengthAt, lengthEnd).toString('ascii');
    const wrongLengthText = String(Number(oldLengthText) + 2);
    expect(wrongLengthText).toHaveLength(oldLengthText.length);
    Buffer.from(wrongLengthText).copy(pdf, lengthAt);

    await expect(readPdfTrustEvidence(pdf, revisionEnd(pdf), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects evidence when the global OCSP array is missing', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const attacked = replaceLast(pdf, '/OCSPs', '/OCSPx');

    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toMatchObject({ message: 'DSS VRI evidence is unbound' });
  });

  it('rejects a DSS catalog entry whose value is PDF null', async () => {
    const pdf = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const attacked = replaceLast(pdf, '/DSS 8 0 R', '/DSS null ');

    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toMatchObject({ message: 'Post-signature modification' });
  });

  it('rejects a DSS graph that exceeds the traversal depth limit', async () => {
    const signed = listUpdatedCatalogInXref(bltSignedDocument);
    const attacked = addDeepDssMember(signed);
    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toMatchObject({ message: 'DSS object graph is too deep' });
  });
});
