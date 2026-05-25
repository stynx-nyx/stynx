import { resolvePdfADeclaration } from '../types';
import type { PdfAValidateOptions, PdfAValidationResult, PdfAValidator } from '../types';

export class StrictPdfAValidator implements PdfAValidator {
  async validate(_pdf: Uint8Array, opts: PdfAValidateOptions = {}): Promise<PdfAValidationResult> {
    return {
      valid: false,
      declared: resolvePdfADeclaration(opts),
      rulesetVersion: 'stynx-strict',
      validatedAt: new Date().toISOString(),
      durationMs: 0,
      errors: [
        {
          ruleId: 'stynx.validator.missing',
          severity: 'error',
          clause: 'STYNX-PDF-A-R12',
          message: 'No real PDF/A validator configured.',
        },
      ],
    };
  }
}
