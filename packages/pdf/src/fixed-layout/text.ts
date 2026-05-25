export function cleanPdfText(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, '?');
}

export function truncatePdfText(value: string, maxLength: number): string {
  return cleanPdfText(value).slice(0, maxLength);
}
