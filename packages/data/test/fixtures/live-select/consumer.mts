import { softDeletable, type Transaction, type StynxDrizzleDatabase } from '@stynx-nyx/data';
import { eq } from 'drizzle-orm';
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

const notes = pgTable('consumer_notes', {
  id: uuid('id').primaryKey(),
  title: text('title').notNull(),
  summary: text('summary'),
});
const counters = softDeletable(pgTable('consumer_counters', {
  key: text('key').primaryKey(),
  quantity: integer('quantity').notNull(),
  optionalQuantity: integer('optional_quantity'),
}));
declare const transaction: Transaction;
declare const native: StynxDrizzleDatabase;

const direct = transaction.select().from(notes);
const filtered = transaction.select().from(notes)
  .where(eq(notes.title, 'kept')).orderBy(notes.id).limit(2);
export type DirectRow = Assert<Equal<Awaited<typeof direct>[number], typeof notes.$inferSelect>>;
export type FilteredRow = Assert<Equal<Awaited<typeof filtered>[number], typeof notes.$inferSelect>>;
export type NoteKeys = Assert<Equal<keyof Awaited<typeof filtered>[number], 'id' | 'title' | 'summary'>>;
export type NullableText = Assert<Equal<Awaited<typeof filtered>[number]['summary'], string | null>>;
// @ts-expect-error a plain table has no archive mode
direct.onlyDeleted();
// @ts-expect-error a nonexistent selected property cannot be certified
export type Missing = Awaited<typeof filtered>[number]['missing'];
// @ts-expect-error nullable text must not become required
const requiredSummary: string = (await filtered)[0]!.summary;

const soft = transaction.select().from(counters);
export const softFiltered = transaction.select().from(counters)
  .where(eq(counters.quantity, 3)).orderBy(counters.key).limit(1);
export type SoftRow = Assert<Equal<Awaited<typeof softFiltered>[number], typeof counters.$inferSelect>>;
export type CounterKeys = Assert<Equal<keyof Awaited<typeof softFiltered>[number], 'key' | 'quantity' | 'optionalQuantity'>>;
export type NullableNumber = Assert<Equal<Awaited<typeof softFiltered>[number]['optionalQuantity'], number | null>>;
// @ts-expect-error the second table must not inherit the first table's fields
export type WrongTable = Awaited<typeof softFiltered>[number]['title'];

export const withDeleted = soft.withDeleted().where(eq(counters.key, 'a')).limit(2);
export const onlyDeleted = soft.onlyDeleted().where(eq(counters.key, 'a')).limit(2);
export type WithArchiveId = Assert<Equal<Awaited<typeof withDeleted>[number]['archiveId'], bigint | null>>;
export type OnlyArchiveId = Assert<Equal<Awaited<typeof onlyDeleted>[number]['archiveId'], bigint>>;
export type ArchiveQuantity = Assert<Equal<Awaited<typeof onlyDeleted>[number]['quantity'], number>>;
export type ArchiveTimestamp = Assert<Equal<Awaited<typeof onlyDeleted>[number]['archivedAt'], Date>>;

export const joined = transaction.select().from(notes).leftJoin(counters, eq(notes.title, counters.key));
export const nativeJoined = native.select().from(notes).leftJoin(counters, eq(notes.title, counters.key));
export type NativeJoinParity = Assert<Equal<Awaited<typeof joined>, Awaited<typeof nativeJoined>>>;
export type JoinedNullable = Assert<Equal<Awaited<typeof joined>[number]['consumer_counters'], typeof counters.$inferSelect | null>>;
void [requiredSummary];
