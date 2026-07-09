// C-4 Session T2 — drizzle schema for demo-bookmark
//
// Matches db/migration.sql (BP-DEMO-BOOKMARK-001 sha a5553692).
// Hand-authored to replace the TypeORM-shaped scaffolder output that S3-2
// flagged as D-A-15.

import { sql } from 'drizzle-orm';
import { check, pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { softDeletable, tenants, users } from '@stynx-nyx/data';

export const demoSchema = pgSchema('demo');

/**
 * demo.demo__bookmark_bookmark — user-saved URL with optional title/notes,
 * tenant-scoped + owner-scoped, soft-deletable. PII registration for `notes`
 * column lives in reference/api/migrations/0001 (incidental_pii,
 * legitimate_interest, P1Y) per INV-PRIVACY-001.
 */
export const bookmarks = softDeletable(
  demoSchema.table(
    'demo__bookmark_bookmark',
    {
      id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
      tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
      ownerId: uuid('owner_id').notNull().references(() => users.id),
      url: text('url').notNull(),
      title: varchar('title', { length: 256 }),
      notes: text('notes'),
      createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
      deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    (table) => ({
      urlLengthCheck: check(
        'demo__bookmark_bookmark_url_length_check',
        sql`char_length(${table.url}) between 1 and 2048`,
      ),
    }),
  ),
);

/**
 * demo.demo__bookmark_bookmark_tag — tags attached to bookmarks. NOT
 * soft-deletable: the (bookmark_id, tag) compound key IS the entity.
 * FK to bookmarks with ON DELETE CASCADE — when a bookmark is hard-deleted
 * its tags go with it. (Soft-delete of bookmark via deleted_at does NOT
 * cascade; tags survive until the bookmark is hard-deleted.)
 */
export const bookmarkTags = demoSchema.table(
  'demo__bookmark_bookmark_tag',
  {
    bookmarkId: uuid('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    tag: varchar('tag', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: sql`primary key (${table.bookmarkId}, ${table.tag})`,
  }),
);
