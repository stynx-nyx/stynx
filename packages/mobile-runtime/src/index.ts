/**
 * Framework-free offline-first mobile runtime for stynx consumer apps.
 *
 * Delivers spec extension E6 (offline write queueing) as a promoted, proven
 * runtime rather than a PWA-only outbox. Pairs with `@stynx-nyx/offline-sync`
 * on the server. Sandbox adapters live in the `testing` entry.
 *
 * @packageDocumentation
 */
export * from './ports.js';
export * from './runtime.js';
export * from './types.js';
