/**
 * Public SDK exports for handwritten transport, auth, session, tenant, error, and generated REST surfaces.
 *
 * @packageDocumentation
 */
export * from './api-client';
export * from './auth';
export * from './auth-provider';
export * from './authorization';
export * from './client';
export * from './cognito';
export * from './errors';
export * from './http';
export * from './jwt';
export * from './session-manager';
export * from './response-decoder';
export * from './tenant-provider';
export * from './token-store';
export * from './transport';
export * from './generated';

// Keep the published legacy model/schema names while the generated route uses
// its explicit JSON wire contract. Generated files remain generator-owned.
export type {
  AuditLogWireItem as AuditLogItem,
  AuditLogWirePage as AuditLogPage,
} from './generated';
export {
  $AuditLogWireItem as $AuditLogItem,
  $AuditLogWirePage as $AuditLogPage,
} from './generated';
export * as OfflineCtg9 from './offline-ctg9';
