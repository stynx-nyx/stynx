import { resolvePdfADeclaration } from '../types';
import type { PdfAValidateOptions, PdfAValidationResult, PdfAValidator } from '../types';

export class NoopPdfAValidator implements PdfAValidator {
  async validate(_pdf: Uint8Array, opts: PdfAValidateOptions = {}): Promise<PdfAValidationResult> {
    return {
      valid: true,
      declared: resolvePdfADeclaration(opts),
      rulesetVersion: 'stynx-noop',
      validatedAt: new Date().toISOString(),
      durationMs: 0,
      errors: [],
    };
  }
}
