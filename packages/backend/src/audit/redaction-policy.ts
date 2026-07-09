import type { Principal } from '@stynx-nyx/contracts';
import type { RequestLike } from '../common/request-context';

export interface AuditMetadataRedactionContext {
  action: string;
  entity: string;
  request: RequestLike;
  principal?: Principal;
}

export interface AuditMetadataRedactionPolicy {
  redact(
    metadata: Record<string, unknown> | undefined,
    context: AuditMetadataRedactionContext,
  ): Record<string, unknown> | undefined;
}

export interface PatternAuditMetadataRedactionPolicyOptions {
  sensitiveKeyPattern?: RegExp;
  replacement?: string;
  maxStringLength?: number;
  maxArrayLength?: number;
  maxDepth?: number;
}

const DEFAULT_SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|password|passwd|pwd|token|secret|credential|app_password|app_login)/i;

/**
 * Generic key-pattern metadata redaction policy derived from SGP production behavior.
 */
export class PatternAuditMetadataRedactionPolicy implements AuditMetadataRedactionPolicy {
  private readonly sensitiveKeyPattern: RegExp;
  private readonly replacement: string;
  private readonly maxStringLength: number;
  private readonly maxArrayLength: number;
  private readonly maxDepth: number;

  constructor(options: PatternAuditMetadataRedactionPolicyOptions = {}) {
    this.sensitiveKeyPattern = options.sensitiveKeyPattern ?? DEFAULT_SENSITIVE_KEY_PATTERN;
    this.replacement = options.replacement ?? '[REDACTED]';
    this.maxStringLength = options.maxStringLength ?? 500;
    this.maxArrayLength = options.maxArrayLength ?? 25;
    this.maxDepth = options.maxDepth ?? 6;
  }

  redact(
    metadata: Record<string, unknown> | undefined,
    _context: AuditMetadataRedactionContext,
  ): Record<string, unknown> | undefined {
    if (!metadata) return metadata;
    const sanitized = this.redactAny(metadata, 0);
    if (!sanitized || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
      return undefined;
    }
    return sanitized as Record<string, unknown>;
  }

  private redactAny(value: unknown, depth: number): unknown {
    if (depth > this.maxDepth) return '[MaxDepth]';
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      return value.length > this.maxStringLength
        ? `${value.slice(0, this.maxStringLength)}...`
        : value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();

    if (Array.isArray(value)) {
      return value
        .slice(0, this.maxArrayLength)
        .map((entry) => this.redactAny(entry, depth + 1));
    }

    if (typeof value === 'object') {
      const output: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
        output[key] = this.sensitiveKeyPattern.test(key)
          ? this.replacement
          : this.redactAny(nested, depth + 1);
      }
      return output;
    }

    return '[Unsupported]';
  }
}
