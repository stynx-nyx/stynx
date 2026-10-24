import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import { uuid } from '../query-schemas.js';

export const readonlyWriteProbeQuery = defineQuery({
  name: 'reference.probe.readonly-write',
  text: sql`
            insert into tenancy.tenant_settings (tenant_id, updated_at)
            values ($1::uuid, clock_timestamp())
            on conflict (tenant_id)
            do update set updated_at = clock_timestamp()
          `,
  params: z.tuple([uuid]), row: z.object({}), expects: 'none',
});
