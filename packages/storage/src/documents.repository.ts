import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

export const archivedDocument = defineQuery({
 name: 'storage.archivedDocument',
 text: sql`
          select archive_id, tenant_id::text, s3_key
          from archive.storage_documents
          where id = $1::uuid
          limit 1
        `,
 params: z.tuple([z.string().regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu)]),
 row: z.object({ archive_id: z.string().regex(/^\d+$/u), tenant_id: z.string().regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu), s3_key: z.string() }),
 expects: 'zero-or-one',
});
