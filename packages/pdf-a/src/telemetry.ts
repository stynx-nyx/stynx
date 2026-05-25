import type { StynxLogger } from '@stynx/logging';

export interface PdfAValidationTelemetry {
  increment?(metric: string, labels?: Record<string, string>): void | Promise<void>;
  observe?(metric: string, value: number, labels?: Record<string, string>): void | Promise<void>;
}

export type PdfAValidationLogger = Pick<StynxLogger, 'log' | 'warn' | 'error'> &
  PdfAValidationTelemetry;

export const PDF_A_VALIDATION_ATTEMPTS_TOTAL = 'pdf_a_validation_attempts_total';
export const PDF_A_VALIDATION_ERRORS_TOTAL = 'pdf_a_validation_errors_total';
export const PDF_A_VALIDATION_DURATION_MS = 'pdf_a_validation_duration_ms';
