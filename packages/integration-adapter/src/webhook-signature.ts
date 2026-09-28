import { createHmac, timingSafeEqual } from 'node:crypto';

export type WebhookVerificationFailure =
  | 'MISSING_RAW_BODY'
  | 'MISSING_HEADER'
  | 'INVALID_TIMESTAMP'
  | 'OUTSIDE_WINDOW'
  | 'INVALID_SIGNATURE'
  | 'REPLAY';

export interface WebhookVerificationInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookReplayStore {
  /** Atomically reserve a key until expiresAt; return false when already reserved. */
  consume(key: string, expiresAt: Date): Promise<boolean>;
}

export interface WebhookVerificationOptions {
  secret: string | Buffer;
  clock: { now(): Date };
  maxSkewMs: number;
  replayStore: WebhookReplayStore;
  replayNamespace: string;
  signatureHeaderName?: string;
  timestampHeaderName?: string;
  /** Return the exact bytes authenticated by the sender, including any identity fields used by the host. */
  message?: (input: WebhookVerificationInput) => Buffer;
  /** Use only fields authenticated by message; the namespace remains prefixed by this helper. */
  replayKey?: (input: WebhookVerificationInput) => string;
}

export type WebhookVerificationResult =
  | { verified: true; timestamp: number; replayKey: string }
  | { verified: false; reason: WebhookVerificationFailure };

/** Distinguishes a replay-store outage from errors in callbacks or the clock. */
export class WebhookReplayStoreError extends Error {
  constructor(cause: unknown) {
    super('Webhook replay store unavailable', { cause });
    this.name = 'WebhookReplayStoreError';
  }
}

function headerName(name: string | undefined, fallback: string): string {
  const value = name ?? fallback;
  if (!value || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(value)) {
    throw new Error('Invalid webhook header name');
  }
  return value.toLowerCase();
}

/** Validate at bootstrap as well as at direct helper invocation. */
export function validateWebhookVerificationOptions(options: WebhookVerificationOptions): void {
  if (!options || !(typeof options.secret === 'string' || Buffer.isBuffer(options.secret)) || !options.secret.length) {
    throw new Error('Webhook secret must be nonempty');
  }
  if (!options.clock || typeof options.clock.now !== 'function') {
    throw new Error('Webhook clock is required');
  }
  if (!Number.isFinite(options.maxSkewMs) || options.maxSkewMs <= 0) {
    throw new Error('Webhook maxSkewMs must be finite and positive');
  }
  if (!options.replayStore || typeof options.replayStore.consume !== 'function') {
    throw new Error('Webhook replay store is required');
  }
  if (typeof options.replayNamespace !== 'string' || !options.replayNamespace.length) {
    throw new Error('Webhook replay namespace must be nonempty');
  }
  headerName(options.signatureHeaderName, 'x-webhook-signature');
  headerName(options.timestampHeaderName, 'x-webhook-timestamp');
  if (options.message !== undefined && typeof options.message !== 'function') {
    throw new Error('Invalid webhook message callback');
  }
  if (options.replayKey !== undefined && typeof options.replayKey !== 'function') {
    throw new Error('Invalid webhook replay key callback');
  }
}

/** Verify raw webhook bytes, the Unix-seconds timestamp, and a single atomic replay reservation. */
export async function verifyWebhookSignature(
  input: WebhookVerificationInput,
  options: WebhookVerificationOptions,
): Promise<WebhookVerificationResult> {
  validateWebhookVerificationOptions(options);
  if (!Buffer.isBuffer(input.rawBody)) return { verified: false, reason: 'MISSING_RAW_BODY' };

  const timestampHeader = input.headers[headerName(options.timestampHeaderName, 'x-webhook-timestamp')];
  const signatureHeader = input.headers[headerName(options.signatureHeaderName, 'x-webhook-signature')];
  if (timestampHeader === undefined || timestampHeader === '' || signatureHeader === undefined || signatureHeader === '') {
    return { verified: false, reason: 'MISSING_HEADER' };
  }
  if (typeof timestampHeader !== 'string' || !/^\d{10}$/u.test(timestampHeader)) {
    return { verified: false, reason: 'INVALID_TIMESTAMP' };
  }
  const timestampSeconds = Number(timestampHeader);
  const tsMs = timestampSeconds * 1000;
  const now = options.clock.now();
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) throw new Error('Webhook clock returned an invalid Date');
  if (!Number.isFinite(tsMs) || Math.abs(nowMs - tsMs) > options.maxSkewMs) {
    return { verified: false, reason: 'OUTSIDE_WINDOW' };
  }
  if (typeof signatureHeader !== 'string' || !/^sha256=[0-9a-f]{64}$/iu.test(signatureHeader)) {
    return { verified: false, reason: 'INVALID_SIGNATURE' };
  }

  const message = options.message?.(input) ?? Buffer.concat([Buffer.from(`${timestampHeader}.`, 'utf8'), input.rawBody]);
  if (!Buffer.isBuffer(message)) throw new Error('Webhook message callback must return a Buffer');
  const expected = createHmac('sha256', options.secret).update(message).digest();
  const supplied = Buffer.from(signatureHeader.slice(7), 'hex');
  if (!timingSafeEqual(expected, supplied)) return { verified: false, reason: 'INVALID_SIGNATURE' };

  const suffix = options.replayKey?.(input) ?? `${timestampSeconds}:${expected.toString('hex')}`;
  if (typeof suffix !== 'string' || !suffix.length) throw new Error('Invalid webhook replay key');
  const replayKey = `${options.replayNamespace}:${suffix}`;
  const expiresAt = new Date(Math.max(nowMs, tsMs + options.maxSkewMs) + 1);
  let consumed: boolean;
  try {
    consumed = await options.replayStore.consume(replayKey, expiresAt);
  } catch (error) {
    throw new WebhookReplayStoreError(error);
  }
  return consumed
    ? { verified: true, timestamp: timestampSeconds, replayKey }
    : { verified: false, reason: 'REPLAY' };
}
