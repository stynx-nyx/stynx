// @ts-nocheck
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { Transaction } from '../../src/transaction';
import { makeLiveOnly, softDeletable } from '../../src/table-markers';

const schema = pgSchema('typecheck_demo');

const softTable = softDeletable(
  schema.table('soft_table', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);

const liveOnlyTable = makeLiveOnly(
  schema.table('live_only_table', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);

declare const trx: Transaction;

void trx.softDelete(softTable, 'soft-id');
void trx.restoreFromArchive(softTable, 'soft-id');
void trx.restoreWithCascade(softTable, 'soft-id');
void trx.hardDelete(softTable, 'soft-id', {
  confirm: 'I understand this is irrecoverable',
});
void trx.hardDelete(liveOnlyTable, 'live-id', {
  confirm: 'I understand this is irrecoverable',
});
void trx.select().from(softTable).withDeleted();
void trx.select().from(softTable).onlyDeleted();

//  live-only tables cannot be soft-deleted
void trx.softDelete(liveOnlyTable, 'live-id');

//  live-only tables cannot be restored from archive
void trx.restoreFromArchive(liveOnlyTable, 'live-id');

//  live-only tables cannot opt into archive-aware queries
void trx.select().from(liveOnlyTable).withDeleted();

//  live-only tables cannot query archive-only rows
void trx.select().from(liveOnlyTable).onlyDeleted();

const confirmation = 'I understand this is irrecoverable' as string;

//  hard delete confirmation must remain the literal string
void trx.hardDelete(softTable, 'soft-id', { confirm: confirmation });
