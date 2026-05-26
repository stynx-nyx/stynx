import { createHash } from 'node:crypto';

const STARTXREF_PATTERN = /startxref\s+(\d+)\s+%%EOF\s*$/u;
const ROOT_PATTERN = /\/Root\s+(\d+)\s+(\d+)\s+R/u;
const ID_PATTERN = /\/ID\s*\[\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\]/u;
const OBJECT_PATTERN = /(\d+)\s+0\s+obj\b/gu;

export function appendIncrementalEvidenceObject(
  pdf: Uint8Array,
  evidenceBlock: Uint8Array,
): Uint8Array {
  const text = Buffer.from(pdf).toString('latin1');
  const previousStartXref = STARTXREF_PATTERN.exec(text)?.[1];
  const root = ROOT_PATTERN.exec(text);
  if (!previousStartXref || !root) {
    return Buffer.concat([Buffer.from(pdf), Buffer.from(evidenceBlock)]);
  }

  const objectNumber = nextObjectNumber(text);
  const objectOffset = pdf.length + 1;
  const evidence = Buffer.from(
    Buffer.from(evidenceBlock).toString('latin1').replace(/\n$/u, ''),
    'latin1',
  );
  const object = Buffer.from(
    [
      '',
      `${objectNumber} 0 obj`,
      `<< /Type /STYNXEvidence /Length ${evidence.length} >>`,
      'stream',
      evidence.toString('latin1'),
      'endstream',
      'endobj',
      '',
    ].join('\n'),
    'latin1',
  );
  const xrefOffset = pdf.length + object.length;
  const [firstId, secondId] = trailerIds(text, pdf, evidence);
  const trailer = Buffer.from(
    [
      `xref`,
      `${objectNumber} 1`,
      `${String(objectOffset).padStart(10, '0')} 00000 n `,
      'trailer',
      `<< /Size ${objectNumber + 1} /Root ${root[1]} ${root[2]} R /Prev ${previousStartXref} /ID [<${firstId}> <${secondId}>] >>`,
      'startxref',
      String(xrefOffset),
      '%%EOF',
      '',
    ].join('\n'),
    'latin1',
  );

  return Buffer.concat([Buffer.from(pdf), object, trailer]);
}

function nextObjectNumber(text: string): number {
  let max = 0;
  for (const match of text.matchAll(OBJECT_PATTERN)) {
    max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function trailerIds(text: string, pdf: Uint8Array, evidence: Uint8Array): [string, string] {
  const existing = ID_PATTERN.exec(text);
  if (existing?.[1] && existing[2]) {
    return [existing[1], existing[2]];
  }
  const id = createHash('sha256')
    .update(pdf)
    .update('\0')
    .update(evidence)
    .digest('hex')
    .slice(0, 32);
  return [id, id];
}
