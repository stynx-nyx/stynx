import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

// PostgreSQL accepts every UUID bit pattern, including its compact/braced spellings.
const uuid = z.string().regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);

export const verifyTenantChainQuery = defineQuery({
  name: 'cli.audit.verify-chain',
  text: sql`
      select
        event_id::text as event_id,
        chain_valid
      from audit.verify_chain($1::uuid, $2::int)
      order by occurred_at, event_id
    `,
  params: z.tuple([uuid, z.number().int().min(1).max(10_000)]),
  row: z.object({ event_id: z.string(), chain_valid: z.boolean() }),
  expects: 'many',
});

export const auditTenantIdsQuery = defineQuery({
  name: 'cli.audit.tenants',
  text: sql`
          select distinct tenancy_id::text as tenant_id
          from audit.events
          where tenancy_id is not null
          order by tenancy_id::text
        `,
  params: z.tuple([]),
  row: z.object({ tenant_id: z.string() }),
  expects: 'many',
});
