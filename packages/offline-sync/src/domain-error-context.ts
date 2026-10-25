import { HttpException } from '@nestjs/common';
import { canonicalOfflineSyncPayload } from './payload-integrity.js';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A rejected item keeps only lossless, bounded host context; invalid evidence remains retryable. */
export function domainErrorContext(error: unknown): {
  valid: boolean;
  context?: Record<string, unknown>;
} {
  try {
    const response = error instanceof HttpException ? error.getResponse() : undefined;
    const value: unknown =
      response && typeof response === 'object' && 'context' in response
        ? Object.getOwnPropertyDescriptor(response, 'context')?.value
        : error && typeof error === 'object' && 'context' in error
          ? Object.getOwnPropertyDescriptor(error, 'context')?.value
          : undefined;
    const holder =
      response && typeof response === 'object' && 'context' in response ? response : error;
    if (holder && typeof holder === 'object' && 'context' in holder) {
      const descriptor = Object.getOwnPropertyDescriptor(holder, 'context');
      if (!descriptor || !('value' in descriptor)) return { valid: false };
    }
    if (value === undefined) return { valid: true };
    if (
      !isObjectRecord(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      'stynx' in value
    )
      return { valid: false };
    canonicalOfflineSyncPayload(value);
    const bytes = JSON.stringify(value);
    if (Buffer.byteLength(bytes) > 4096) return { valid: false };
    return { valid: true, context: JSON.parse(bytes) as Record<string, unknown> };
  } catch {
    return { valid: false };
  }
}
