/** Test-only incremental PDF revisions that exercise effective xref semantics. */
const lastXref = (pdf: Buffer): number => {
  const match = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(pdf.toString('latin1'));
  if (!match) throw new Error('PDF startxref absent');
  return Number(match[1]);
};
const row = (offset: number, status: 'n' | 'f' = 'n') =>
  `${String(offset).padStart(10, '0')} ${status === 'f' ? '00001' : '00000'} ${status} \n`;

export function appendDuplicatePrev(pdf: Uint8Array): Uint8Array {
  const original = Buffer.from(pdf);
  const prior = lastXref(original);
  const xrefAt = original.length;
  return Buffer.concat([original, Buffer.from(
    `xref\n0 1\n0000000000 65535 f \n` +
    `trailer\n<< /Size 15 /Root 1 0 R /Prev ${prior} /Prev 0 >>\n` +
    `startxref\n${xrefAt}\n%%EOF\n`,
  )]);
}

export function appendHybridXref(pdf: Uint8Array, entryType: 1 | 2): Uint8Array {
  const original = Buffer.from(pdf);
  const prior = lastXref(original);
  const byte = (value: number, width: number) => {
    const out = Buffer.alloc(width);
    out.writeUIntBE(value, 0, width);
    return out;
  };
  const shadowTarget = original.length;
  const shadow = Buffer.from(
    '19 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Length 63 >>\n' +
    'stream\n4 0 << /Length 7 >> stream changed endstream\nendstream\nendobj\n',
  );
  const xrefStreamOffset = original.length + shadow.length;
  const entry = Buffer.concat([
    byte(entryType, 1),
    byte(entryType === 1 ? shadowTarget + shadow.indexOf(Buffer.from('4 0 <<')) : 19, 4),
    byte(entryType === 1 ? 0 : 0, 2),
  ]);
  const xrefStream = Buffer.concat([
    Buffer.from(`18 0 obj\n<< /Type /XRef /Size 20 /W [1 4 2] /Index [4 1] /Length ${entry.length} >>\nstream\n`),
    entry,
    Buffer.from('\nendstream\nendobj\n'),
  ]);
  const xrefAt = xrefStreamOffset + xrefStream.length;
  return Buffer.concat([original, shadow, xrefStream, Buffer.from(
    `xref\n18 2\n${row(xrefStreamOffset)}${row(shadowTarget)}` +
    `trailer\n<< /Size 20 /Root 1 0 R /Prev ${prior} /XRefStm ${xrefStreamOffset} >>\n` +
    `startxref\n${xrefAt}\n%%EOF\n`,
  )]);
}

export function appendCatalogShadow(pdf: Uint8Array): Uint8Array {
  const original = Buffer.from(pdf);
  const prior = lastXref(original);
  const vri = /\/VRI\s*<<\s*\/([A-F0-9]{40})\s+9\s+0\s+R/u.exec(original.toString('latin1'))?.[1];
  if (!vri) throw new Error('Signed PDF has no DSS VRI');
  const fakeMarker = Buffer.from(
    `8 0 obj\n<< /Type /DSS /Note (x stream\n) ` +
    `/Certs [10 0 R 14 0 R 17 0 R] /OCSPs [11 0 R 13 0 R] ` +
    `/CRLs [12 0 R] /VRI << /${vri} 9 0 R >> >>\nendobj\n`,
  );
  const visibleCatalog = Buffer.from(
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R /DSS 8 0 R >>\nendobj\n',
  );
  const hiddenCatalog = Buffer.from(
    'endstream\n1 0 obj\n<< /Type /Catalog /Pages 99 0 R /DSS 8 0 R >>\nendobj\n' +
    '99 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n',
  );
  const certificate = Buffer.from('fake-certificate-prefix\n');
  const body = Buffer.concat([certificate, hiddenCatalog]);
  const stream = Buffer.concat([
    Buffer.from(`17 0 obj\n<< /Length ${body.length} >>\nstream\n`),
    body,
    Buffer.from('endstream\nendobj\n'),
  ]);
  const dssOffset = original.length;
  const visibleCatalogOffset = dssOffset + fakeMarker.length;
  const streamOffset = visibleCatalogOffset + visibleCatalog.length;
  const shadowOffset = streamOffset + stream.indexOf(Buffer.from('1 0 obj'));
  const xrefAt = streamOffset + stream.length;
  return Buffer.concat([original, fakeMarker, visibleCatalog, stream, Buffer.from(
    `xref\n1 1\n${row(shadowOffset)}` +
    `8 1\n${row(dssOffset)}` +
    `17 1\n${row(streamOffset)}` +
    `trailer\n<< /Size 100 /Root 1 0 R /Prev ${prior} >>\n` +
    `startxref\n${xrefAt}\n%%EOF\n`,
  )]);
}
