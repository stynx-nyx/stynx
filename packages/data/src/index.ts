/**
 * Public data access exports for pools, migrations, transactions, schemas, and archive helpers.
 *
 * @packageDocumentation
 */
/* istanbul ignore file -- barrel export surface; package behavior is covered through concrete modules. */
/** Data module exports for NestJS consumers. */
export { StynxDataModule, StynxDataModule as DataModule } from './data.module';
/** Database service export. */
export { Database } from './database';
/** Application SQL role configuration exports (ADR-OUTBOX-0003 D1). */
export { APP_ROLE_NAME_MAX_BYTES, DEFAULT_APP_ROLE_NAME, resolveAppRoleName } from './app-role';
/** Product role prefix exports for the platform migrations (S-18). */
export {
  DEFAULT_ROLE_PREFIX,
  ROLE_PREFIX_MAX_LENGTH,
  applyRolePrefix,
  assertRolePrefix,
  platformRoleNames,
  type PlatformRoleNames,
} from './platform-roles';
/** Transaction and Drizzle helper exports. */
export { Transaction, createDrizzle, type StynxDrizzleDatabase } from './transaction';
/** PostgreSQL pool registry exports. */
export { StynxPoolRegistry, createStynxPgPool, type StynxPgPoolOptions } from './pools';
/** PostgreSQL client factory exports for controlled test and CLI utilities. */
export { createStynxPgClient, type StynxPgClient, type StynxPgClientConfig } from './client';
/** System-context helper export. */
export { withSystemContext } from './system-context';
export * from './table-markers';
export * from './types';
export * from './errors';
export * from './tokens';
export * from './schema';
export * from './query-helpers';
export * from './storage-contract';
export * from './storage-catalog';
