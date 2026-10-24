/**
 * Public data access exports for pools, migrations, transactions, schemas, and archive helpers.
 *
 * @packageDocumentation
 */
/* istanbul ignore file -- barrel export surface; package behavior is covered through concrete modules. */
/** Data module exports for NestJS consumers. */
export { StynxDataModule, StynxDataModule as DataModule } from './data.module.js';
/** Database service export. */
export { Database } from './database.js';
/** Application SQL role configuration exports (ADR-OUTBOX-0003 D1). */
export { APP_ROLE_NAME_MAX_BYTES, DEFAULT_APP_ROLE_NAME, resolveAppRoleName } from './app-role.js';
/** Product role prefix exports for the platform migrations (S-18). */
export {
  DEFAULT_ROLE_PREFIX,
  ROLE_PREFIX_MAX_LENGTH,
  applyRolePrefix,
  assertRolePrefix,
  platformRoleNames,
  type PlatformRoleNames,
} from './platform-roles.js';
/** Typed-query helper exports (02 §3, D-030). */
export { executeTypedQuery, defineQuery, sql, type Expects, type ResultOf, type TypedQuery } from './typed-query.js';
/** Controlled installation scripts; workspace lint admits only declared lifecycle callers. */
export { bindQueryContext, createScopedQueryExecutor, type ContextualQueryExecutor, type CheckedQueryScope, executeConfiguredQuery, type ConfiguredSqlExecutor, executeTypedQueryResult, executeTypedCommand, executeGuardedQueryRows, executeRawScript, type CheckedQueryClient } from './checked-executor.js';
/** Transaction and Drizzle helper exports. */
export { Transaction, createDrizzle, type StynxDrizzleDatabase } from './transaction.js';
/** PostgreSQL pool registry exports. */
export { StynxPoolRegistry, createStynxPgPool, type StynxPgPoolOptions } from './pools.js';
/** PostgreSQL client factory exports for controlled test and CLI utilities. */
export { createStynxPgClient, type StynxPgClient, type StynxPgClientConfig } from './client.js';
/** System-context helper export. */
export { withSystemContext } from './system-context.js';
export * from './table-markers.js';
export * from './types.js';
export * from './errors.js';
export * from './tokens.js';
export * from './schema/index.js';
export * from './query-helpers.js';
export * from './storage-contract.js';
export * from './storage-catalog.js';
