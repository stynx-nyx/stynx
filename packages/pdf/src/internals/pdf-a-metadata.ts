import { createHash } from 'node:crypto';
import { PDFArray, PDFHexString, PDFName, PDFNumber, PDFString, type PDFDocument } from 'pdf-lib';

import { loadSrgbIccProfile } from './assets';

export interface PdfAMetadataInput {
  title: string;
  subject: string;
  author: string;
  creator: string;
  producer: string;
  createdAt: Date;
  modifiedAt: Date;
  evidenceBlock?: Uint8Array | undefined;
}

export function applyPdfAConformanceMetadata(pdf: PDFDocument, metadata: PdfAMetadataInput): void {
  setDeterministicTrailerId(pdf, metadata);
  setOutputIntent(pdf);
  setXmpMetadata(pdf, metadata);
}

export function setDeterministicTrailerId(pdf: PDFDocument, metadata: PdfAMetadataInput): void {
  const idHex = createHash('sha256')
    .update(metadata.title)
    .update('\0')
    .update(metadata.author)
    .update('\0')
    .update(metadata.createdAt.toISOString())
    .digest('hex')
    .slice(0, 32);
  pdf.context.trailerInfo.ID = pdf.context.obj([PDFHexString.of(idHex), PDFHexString.of(idHex)]);
}

function setOutputIntent(pdf: PDFDocument): void {
  const iccStream = pdf.context.stream(loadSrgbIccProfile(), {
    N: 3,
    Alternate: PDFName.of('DeviceRGB'),
  });
  const iccRef = pdf.context.register(iccStream);
  const outputIntent = pdf.context.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1 no black scaling'),
    DestOutputProfile: iccRef,
  });
  const outputIntentRef = pdf.context.register(outputIntent);
  const outputIntents = PDFArray.withContext(pdf.context);
  outputIntents.push(outputIntentRef);
  pdf.catalog.set(PDFName.of('OutputIntents'), outputIntents);
}

function setXmpMetadata(pdf: PDFDocument, metadata: PdfAMetadataInput): void {
  const xmpStream = pdf.context.stream(renderXmp(metadata), {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML'),
  });
  const xmpRef = pdf.context.register(xmpStream);
  pdf.catalog.set(PDFName.of('Metadata'), xmpRef);
}

function renderXmp(metadata: PdfAMetadataInput): string {
  const evidenceComment = metadata.evidenceBlock
    ? `\n   <!-- ${Buffer.from(metadata.evidenceBlock).toString('latin1').trim()} -->`
    : '';
  return [
    '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '  <rdf:Description rdf:about=""',
    '    xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '    xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    '    xmlns:pdf="http://ns.adobe.com/pdf/1.3/"',
    '    xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">',
    `   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.title)}</rdf:li></rdf:Alt></dc:title>`,
    `   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.subject)}</rdf:li></rdf:Alt></dc:description>`,
    `   <dc:creator><rdf:Seq><rdf:li>${escapeXml(metadata.author)}</rdf:li></rdf:Seq></dc:creator>`,
    `   <xmp:CreateDate>${formatPdfDate(metadata.createdAt)}</xmp:CreateDate>`,
    `   <xmp:ModifyDate>${formatPdfDate(metadata.modifiedAt)}</xmp:ModifyDate>`,
    `   <xmp:CreatorTool>${escapeXml(metadata.creator)}</xmp:CreatorTool>`,
    `   <pdf:Producer>${escapeXml(metadata.producer)}</pdf:Producer>`,
    `   <pdfaid:part>${PDFNumber.of(2).asNumber()}</pdfaid:part>`,
    '   <pdfaid:conformance>B</pdfaid:conformance>',
    `  ${evidenceComment}`,
    '  </rdf:Description>',
    ' </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
    '',
  ].join('\n');
}

function formatPdfDate(value: Date): string {
  return value.toISOString().replace('.000Z', 'Z');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}
