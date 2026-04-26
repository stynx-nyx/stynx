import { bigint, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { softDeletable } from '../table-markers';
import { users } from './auth';
import { tenants } from './tenancy';

export const storageSchema = pgSchema('storage');

export const documents = softDeletable(storageSchema.table('documents', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  collection: text('collection').notNull(),
  s3Key: text('s3_key').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  checksumSha256: text('checksum_sha256').notNull(),
  scanStatus: text('scan_status').notNull().default('not_scanned'),
  scanDetail: jsonb('scan_detail').notNull().default({}),
  encryption: text('encryption').notNull().default('aws:kms'),
  classification: text('classification'),
  ownerUserId: uuid('owner_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const documentVersions = storageSchema.table('document_versions', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  documentId: uuid('document_id').notNull().references(() => documents.id),
  versionNumber: integer('version_number').notNull(),
  s3VersionId: text('s3_version_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const documentAcl = storageSchema.table('document_acl', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  documentId: uuid('document_id').notNull().references(() => documents.id),
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  permissionKey: text('permission_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
