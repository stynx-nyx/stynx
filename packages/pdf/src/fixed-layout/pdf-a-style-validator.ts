export interface PdfAStyleValidationResult {
  valid: boolean;
  reasons: string[];
}

export function validatePdfAStyle(buffer: Uint8Array): PdfAStyleValidationResult {
  const text = Buffer.from(buffer).toString('latin1');
  const reasons: string[] = [];
  if (!text.startsWith('%PDF-')) {
    reasons.push('missing PDF header');
  }
  if (!text.includes('/Title')) {
    reasons.push('missing document title metadata');
  }
  if (!text.includes('/Creator')) {
    reasons.push('missing creator metadata');
  }
  if (!text.includes('/Font')) {
    reasons.push('missing font resources');
  }
  return { valid: reasons.length === 0, reasons };
}
