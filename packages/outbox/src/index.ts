/**
 * Public exports for the transactional outbox: same-transaction `enqueue`,
 * claim-and-dispatch, pluggable dispatcher port, backoff policies, HMAC ACK
 * signature helpers, and NestJS module wiring.
 *
 * @packageDocumentation
 */
export * from './ack-signature.js';
export * from './backoff.js';
export * from './constants.js';
export * from './errors.js';
export * from './event-stream-source.js';
export * from './http-outbox-dispatcher.js';
export * from './metrics.js';
export * from './outbox.module.js';
export * from './outbox.service.js';
export * from './types.js';
export * from './storage.js';
