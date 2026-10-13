import { HttpException } from '@nestjs/common';

/** A rejected item keeps only lossless, bounded host context; invalid evidence remains retryable. */
export function domainErrorContext(error: unknown): {
  valid: boolean;
  context?: Record<string, unknown>;
} {
  try {
    const response = error instanceof HttpException ? error.getResponse() : undefined;
    const value =
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
    const seen = new Set<object>();
    const json = (entry: unknown): boolean => {
      if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return true;
      if (typeof entry === 'number') return Number.isFinite(entry);
      if (!entry || typeof entry !== 'object' || seen.has(entry)) return false;
      seen.add(entry);
      const descriptors = Object.getOwnPropertyDescriptors(entry);
      const valid =
        (Array.isArray(entry) || Object.getPrototypeOf(entry) === Object.prototype) &&
        Reflect.ownKeys(entry).every((key) => {
          if (Array.isArray(entry) && key === 'length') return true;
          if (typeof key !== 'string') return false;
          const descriptor = descriptors[key];
          return (
            !!descriptor && descriptor.enumerable && 'value' in descriptor && json(descriptor.value)
          );
        }) &&
        (!Array.isArray(entry) || Object.keys(entry).length === entry.length);
      seen.delete(entry);
      return valid;
    };
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      'stynx' in value ||
      !json(value)
    )
      return { valid: false };
    const bytes = JSON.stringify(value);
    if (Buffer.byteLength(bytes) > 4096) return { valid: false };
    return { valid: true, context: JSON.parse(bytes) as Record<string, unknown> };
  } catch {
    return { valid: false };
  }
}
