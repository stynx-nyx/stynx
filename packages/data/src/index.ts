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
