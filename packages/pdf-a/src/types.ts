export type PdfAVersion = 'A-1' | 'A-2' | 'A-3' | 'A-4';

export type PdfAConformance = 'b' | 'u' | 'a';

export interface PdfAValidateOptions {
  version?: PdfAVersion;
  conformance?: PdfAConformance;
}

export interface PdfARuleLocation {
  page?: number;
  object?: string;
}

export interface PdfARuleError {
  ruleId: string;
  severity: 'error' | 'warning';
  clause: string;
  message: string;
  locations?: PdfARuleLocation[];
}

export interface PdfAValidationResult {
  valid: boolean;
  declared: { version: PdfAVersion; conformance: PdfAConformance } | null;
  rulesetVersion: string;
  validatedAt: string;
  durationMs: number;
  errors: PdfARuleError[];
}

export interface PdfAValidator {
  validate(pdf: Uint8Array, opts?: PdfAValidateOptions): Promise<PdfAValidationResult>;
}

export function resolvePdfADeclaration(
  opts: PdfAValidateOptions = {},
): { version: PdfAVersion; conformance: PdfAConformance } {
  return {
    version: opts.version ?? 'A-2',
    conformance: opts.conformance ?? 'b',
  };
}
