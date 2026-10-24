import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import { uuid } from '../query-schemas.js';

const lookupRecordArchive = defineQuery({
  name: 'reference.sample.archive-record',
  text: sql`select archive_id::text as archive_id from archive.sample_record where id = $1::uuid and tenant_id = $2::uuid limit 1`,
  params: z.tuple([uuid, uuid]),
  row: z.object({ archive_id: z.string().regex(/^[0-9]+$/u) }),
  expects: 'zero-or-one',
});

const lookupRecordNoteArchive = defineQuery({
  name: 'reference.sample.archive-record_note',
  text: sql`select archive_id::text as archive_id from archive.sample_record_note where id = $1::uuid and tenant_id = $2::uuid limit 1`,
  params: z.tuple([uuid, uuid]),
  row: z.object({ archive_id: z.string().regex(/^[0-9]+$/u) }),
  expects: 'zero-or-one',
});

const lookupWorkItemArchive = defineQuery({
  name: 'reference.sample.archive-work_item',
  text: sql`select archive_id::text as archive_id from archive.sample_work_item where id = $1::uuid and tenant_id = $2::uuid limit 1`,
  params: z.tuple([uuid, uuid]),
  row: z.object({ archive_id: z.string().regex(/^[0-9]+$/u) }),
  expects: 'zero-or-one',
});

const lookupWorkItemEntryArchive = defineQuery({
  name: 'reference.sample.archive-work_item_entry',
  text: sql`select archive_id::text as archive_id from archive.sample_work_item_entry where id = $1::uuid and tenant_id = $2::uuid limit 1`,
  params: z.tuple([uuid, uuid]),
  row: z.object({ archive_id: z.string().regex(/^[0-9]+$/u) }),
  expects: 'zero-or-one',
});

const lookupWorkItemLockArchive = defineQuery({
  name: 'reference.sample.archive-work_item_lock',
  text: sql`select archive_id::text as archive_id from archive.sample_work_item_lock where id = $1::uuid and tenant_id = $2::uuid limit 1`,
  params: z.tuple([uuid, uuid]),
  row: z.object({ archive_id: z.string().regex(/^[0-9]+$/u) }),
  expects: 'zero-or-one',
});

export const sampleArchiveLookups = Object.freeze({
  'archive.sample_record': lookupRecordArchive,
  'archive.sample_record_note': lookupRecordNoteArchive,
  'archive.sample_work_item': lookupWorkItemArchive,
  'archive.sample_work_item_entry': lookupWorkItemEntryArchive,
  'archive.sample_work_item_lock': lookupWorkItemLockArchive,
} as const);
