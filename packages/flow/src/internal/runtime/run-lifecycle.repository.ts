import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

const textFromRun = z.unknown().pipe(z.string().nullish());
// build_facts returns jsonb_build_object; retain opaque nested values by identity.
const facts = z.custom<Record<string, unknown>>((value) => typeof value === 'object' && value !== null && !Array.isArray(value));

export const buildRunFactsQuery = defineQuery({
  name: 'flow.run-lifecycle.build-facts',
  text: sql`select flow.build_facts($1::uuid, $2::text, $3::text) as facts`,
  params: z.tuple([textFromRun, textFromRun, textFromRun]),
  row: z.object({ facts: facts.nullish() }),
  expects: 'many',
});

export function isRunLifecycleRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const updateRunStatusQuery = defineQuery({
  name: 'flow.run-lifecycle.update-status',
  text: sql`
          update flow.runs
          set status = $2::flow.run_status,
              updated_by = $3::uuid,
              updated_at = clock_timestamp()
          where id = $1::uuid
          returning *
        `,
  params: z.tuple([z.string(), z.enum(['active', 'completed', 'canceled']), z.string().nullable()]),
  row: z.looseObject({ id: z.unknown().optional(), status: z.unknown().optional() }),
  expects: 'many',
});
