import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies an inbound outbox-ACK HMAC-SHA256 body signature.
 *
 * Expected header format: `sha256=<hex_digest>`.
 *
 * Promoted from pec's `domain/shared/api/src/webhook-signature.ts` (itself
 * ported from the deleted `apps/api/src/@core/security/webhook-signature.ts`).
 * Intended for the inbound ACK route a consuming app exposes for
 * `OutboxService.ack()` — mark that route `@Public()` (bearer auth bypassed)
 * and call this helper against the raw request body before trusting it.
 * Uses constant-time comparison to avoid timing side-channels.
 */
export function verifyOutboxAckSignature(secret: string, rawBody: Buffer, header: string): boolean {
  if (!header.startsWith('sha256=')) {
    return false;
  }
  const expected = Buffer.from(header.slice(7), 'hex');
  if (expected.length === 0) {
    return false;
  }
  const computed = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'hex');
  if (computed.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(computed, expected);
}

/**
 * Computes the `sha256=<hex_digest>` header value for a given body and
 * secret. Not needed by the outbox's own ACK-verification path (the
 * *sender* of the ACK — the external system — computes this); provided so
 * tests and local dispatcher fakes can sign a synthetic ACK request without
 * hand-rolling HMAC each time.
 */
export function signOutboxAckPayload(secret: string, rawBody: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}
