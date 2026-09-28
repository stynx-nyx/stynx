import { HttpErrorResponse } from '@angular/common/http';
import { StynxSdkError, createStynxSdkError } from '@stynx-nyx/sdk';

export type StynxErrorKind =
  | 'network'
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not-found'
  | 'conflict'
  | 'precondition'
  | 'rate-limit'
  | 'server'
  | 'unknown';

export interface StynxErrorClassificationOptions {
  messageKeysByCodePrefix?: Record<string, string>;
  fallbackMessageKey?: string;
}

export interface StynxErrorClassification {
  kind: StynxErrorKind;
  status?: number;
  code?: string;
  messageKey: string;
}

function kindForStatus(status: number | undefined): StynxErrorKind {
  if (status === 0) return 'network';
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'authentication';
  if (status === 403) return 'authorization';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 412 || status === 428) return 'precondition';
  if (status === 429) return 'rate-limit';
  if (status !== undefined && status >= 500 && status <= 599) return 'server';
  return 'unknown';
}

function messageKeyFor(
  code: string | undefined,
  kind: StynxErrorKind,
  options: StynxErrorClassificationOptions,
): string {
  const configured = options.messageKeysByCodePrefix;
  if (code && configured) {
    if (Object.prototype.hasOwnProperty.call(configured, code)) return configured[code]!;
    for (let index = code.length - 1; index > 0; index--) {
      if (code[index] !== ':' && code[index] !== '_') continue;
      const prefix = code.slice(0, index);
      if (Object.prototype.hasOwnProperty.call(configured, prefix)) return configured[prefix]!;
    }
  }
  return options.fallbackMessageKey ?? `ui.error.${kind}`;
}

/** Classify an HTTP or SDK failure without treating server copy as a translation key. */
export function classifyStynxError(
  error: unknown,
  options: StynxErrorClassificationOptions = {},
): StynxErrorClassification {
  const mapped = error instanceof HttpErrorResponse
    ? createStynxSdkError(error.status, error.error)
    : error instanceof StynxSdkError ? error : undefined;
  const status = mapped?.status ?? (
    typeof error === 'object' && error !== null && 'status' in error && error.status === 0
      ? 0 : undefined
  );
  const code = mapped?.code;
  let kind = kindForStatus(status);
  if (kind === 'unknown' && code?.endsWith('_VALIDATION_ERROR')) kind = 'validation';
  return {
    kind,
    ...(status !== undefined ? { status } : {}),
    ...(code ? { code } : {}),
    messageKey: messageKeyFor(code, kind, options),
  };
}
