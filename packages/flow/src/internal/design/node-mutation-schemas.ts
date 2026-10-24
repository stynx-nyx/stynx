import type { TypedQuery } from '@stynx-nyx/data';
import { z } from 'zod';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const numeric = z.union([text, z.number(), z.nan(), z.literal(Infinity), z.literal(-Infinity)]);

// Preserve the existing DTO's opaque JSON object values; the database performs
// the same JSON serialization and column checks after parameter validation.
export const nodeMutationParams = {
  uuid,
  actor: uuid.nullable(),
  text: text.nullable(),
  numeric: numeric.nullable(),
  integer: z.union([z.number().int(), text]).nullable(),
  textArray: z.array(text.nullable()).nullable(),
  json: z.union([z.json(), z.record(text, z.unknown())]),
  timestamp,
};

export const nodeMutationRow = z.looseObject({
  // Consumers expose opaque rows; graph import owns its existing required-ID error.
  // This field does not promise a validated UUID. Other physical fields stay checked.
  id: z.unknown().optional(),
  tenant_id: uuid,
  graph_id: uuid,
  code: text,
  name: text.nullable(),
  kind: z.enum(['human', 'auto', 'system', 'start', 'end', 'gateway']),
  decision_policy: z.enum(['all', 'any', 'quorum']),
  quorum_ratio: numeric.nullable(),
  allowed_actions: z.array(text.nullable()),
  sla_seconds: z.number().int().nullable(),
  entry_rule: text.nullable(),
  exit_rule: text.nullable(),
  sort_order: z.number().int(),
  meta: z.json(),
  created_by: uuid.nullable(),
  updated_by: uuid.nullable(),
  created_at: timestamp,
  updated_at: timestamp,
});

// The selected definition retains its precise runtime tuple. The common type
// keeps mask selection from constructing an exponential TypeScript union.
export type NodeMutationQuery = TypedQuery<z.ZodTuple, typeof nodeMutationRow, 'many'>;
