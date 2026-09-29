import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { SignatureTrustError, SignatureTrustUnavailableError } from '../../src/errors';
import { readPdfTrustEvidence } from '../../src/pdf-trust-evidence';
import { listUpdatedCatalogInXref } from '../fixtures/pki/xref-attacks';
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

const lastStartXref = (pdf: Buffer): number => {
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(pdf.toString('latin1'));
  if (!match) throw new Error('fixture has no terminal startxref');
  return Number(match[1]);
};

const row = (offset: number): string => `${String(offset).padStart(10, '0')} 00000 n \n`;

function replaceRange(pdf: Uint8Array, start: number, before: string, after: string): Buffer {
  return Buffer.concat([
    Buffer.from(pdf).subarray(0, start), Buffer.from(after), Buffer.from(pdf).subarray(start + before.length),
  ]);
}

function appendUnreferencedObject(pdf: Uint8Array, objectBody: string): Uint8Array {
  const original = Buffer.from(pdf);
  const previousXref = lastStartXref(original);
  const objectOffset = original.length;
  const object = Buffer.from(`20 0 obj\n${objectBody}\nendobj\n`);
  const xrefOffset = original.length + object.length;
  return Buffer.concat([original, object, Buffer.from(
    `xref\n20 1\n${row(objectOffset)}` +
    `trailer\n<< /Size 21 /Root 1 0 R /Prev ${previousXref} >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`,
  )]);
}

function replaceLast(pdf: Uint8Array, before: string, after: string): Buffer {
  if (before.length !== after.length) throw new Error('replacement must preserve byte offsets');
  const result = Buffer.from(pdf);
  const at = result.lastIndexOf(Buffer.from(before));
  if (at < 0) throw new Error(`PDF marker absent: ${before}`);
  Buffer.from(after).copy(result, at);
  return result;
}

describe('additional PDF trust evidence hardening paths', () => {
  it.each([
    ['wrong Prev type', (pdf: Uint8Array) => replaceLast(pdf, '/Prev 100890', '/Prev /Nope '),
      'Post-signature modification'],
    ['Prev cycle', (pdf: Uint8Array) => {
      const result = Buffer.from(pdf);
      const currentXref = lastStartXref(result);
      return replaceLast(result, '/Prev 100890', `/Prev ${String(currentXref).padStart(6, '0')}`);
    }, 'Post-signature modification'],
    ['Prev outside the file', (pdf: Uint8Array) => replaceLast(pdf, '/Prev 100890', '/Prev 999999'),
      'Post-signature modification'],
  ])('rejects malformed xref trailer links (%s)', async (_label, mutate, message) => {
    const revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const attacked = mutate(revision);
    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toMatchObject({ name: 'SignatureTrustError', message });
  });

  it('rejects a trailer whose startxref pointer does not identify its xref table', async () => {
    const revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xrefOffset = lastStartXref(revision);
    const attacked = replaceLast(revision, `startxref\n${xrefOffset}\n`,
      `startxref\n${xrefOffset + 1}\n`);
    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustUnavailableError);
  });

  it('rejects a post-signature trailer that introduces encryption metadata', async () => {
    const revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const before = '/Root 1 0 R /Prev';
    const at = revision.lastIndexOf(Buffer.from(before));
    const attacked = replaceRange(revision, at, before, '/Root 1 0 R /Encrypt true /Prev');
    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects an incremental xref entry that points into the signed revision', async () => {
    const revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xrefOffset = lastStartXref(revision);
    const subtable = Buffer.from('8 7\n');
    const at = revision.indexOf(subtable, xrefOffset) + subtable.length;
    expect(at).toBeGreaterThanOrEqual(subtable.length);
    Buffer.from('0000000001').copy(revision, at);
    await expect(readPdfTrustEvidence(revision, revisionEnd(revision), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects an otherwise valid trust revision containing an unreferenced object', async () => {
    const revision = listUpdatedCatalogInXref(bltSignedDocument);
    const attacked = appendUnreferencedObject(revision, '(unbound post-signature object)');
    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects an unreferenced object stream that is not loaded into the trusted object context', async () => {
    const revision = listUpdatedCatalogInXref(bltSignedDocument);
    const body = '<< /Type /ObjStm /N 1 /First 4 /Length 9 >>\nstream\n21 0 null\nendstream';
    const withObjectStream = appendUnreferencedObject(revision, body);
    await expect(readPdfTrustEvidence(withObjectStream, revisionEnd(withObjectStream), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects DSS evidence when the global certificate stream list is empty', async () => {
    const revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const before = '/Certs [10 0 R 14 0 R]';
    const after = '/Certs []' + ' '.repeat(before.length - '/Certs []'.length);
    const attacked = replaceLast(revision, before, after);
    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), bltCmsSignature))
      .rejects.toMatchObject({ message: 'DSS VRI evidence is unbound' });
  });

  it('rejects duplicate indirect references that shadow an original object', async () => {
    const revision = Buffer.from(listUpdatedCatalogInXref(bltSignedDocument));
    const xref = revision.lastIndexOf(Buffer.from('xref\n1 1\n'));
    expect(xref).toBeGreaterThanOrEqual(0);
    const rowOffset = revision.indexOf(Buffer.from('8 7\n'), xref);
    expect(rowOffset).toBeGreaterThanOrEqual(0);
    const signedPrefix = Buffer.from(bltSignedDocument).subarray(0, revisionEnd(bltSignedDocument));
    const originalXref = lastStartXref(signedPrefix);
    const originalText = signedPrefix.toString('latin1').slice(originalXref);
    const originalObject = /(?:^|\n)3 1\n(\d{10}) 00000 n/u.exec(originalText);
    expect(originalObject?.[1]).toMatch(/^\d{10}$/u);
    // Point the new DSS dictionary entry at the original signed catalog. The
    // effective catalog binding must reject that stale xref identity.
    Buffer.from(originalObject![1]!).copy(revision, rowOffset + '8 7\n'.length);
    await expect(readPdfTrustEvidence(revision, revisionEnd(revision), bltCmsSignature))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });

  it('rejects a corrupt evidence stream payload rather than returning undecoded bytes', async () => {
    const pdf = Buffer.from(bytes('pades-compact-blt.pdf'));
    const cms = bytes('pades-compact-blt.cms.der');
    const document = await PDFDocument.load(pdf);
    const dss = document.catalog.lookupMaybe(PDFName.of('DSS'), PDFDict);
    const ocsp = dss?.lookupMaybe(PDFName.of('OCSPs'), PDFArray);
    const stream = ocsp?.lookupMaybe(0, PDFRawStream);
    expect(stream).toBeInstanceOf(PDFRawStream);
    expect(stream.dict.lookupMaybe(PDFName.of('Filter'), PDFName)?.toString()).toBe('/FlateDecode');
    const ref = document.context.getObjectRef(stream!);
    expect(ref?.generationNumber).toBe(0);
    const objectHeader = Buffer.from(`${ref!.objectNumber} ${ref!.generationNumber} obj`);
    const objectAt = pdf.indexOf(objectHeader);
    expect(objectAt).toBeGreaterThanOrEqual(0);
    const streamStart = pdf.indexOf(Buffer.from('stream\n'), objectAt) + Buffer.byteLength('stream\n');
    expect(streamStart).toBeGreaterThan(objectAt);
    const attacked = Buffer.from(pdf);
    attacked[streamStart] = 0;
    await expect(readPdfTrustEvidence(attacked, revisionEnd(attacked), cms))
      .rejects.toBeInstanceOf(SignatureTrustError);
  });
});
