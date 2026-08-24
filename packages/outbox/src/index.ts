/**
 * Public exports for the transactional outbox: same-transaction `enqueue`,
 * claim-and-dispatch, pluggable dispatcher port, backoff policies, HMAC ACK
 * signature helpers, and NestJS module wiring.
 *
 * @packageDocumentation
 */
export * from './ack-signature';
export * from './backoff';
export * from './constants';
export * from './errors';
export * from './http-outbox-dispatcher';
export * from './metrics';
export * from './outbox.module';
export * from './outbox.service';
export * from './types';
