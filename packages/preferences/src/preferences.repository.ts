import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
// Persisted extension properties remain opaque; only the declared preference leaves
// are validated. The service continues to apply its separate request constraints.
const overrides = z.looseObject({
  locale: z.looseObject({ locale: text.exactOptional(), timezone: text.exactOptional() }).exactOptional(),
  theme: z.looseObject({
    colorScheme: z.enum(['system', 'light', 'dark']).exactOptional(),
    contrast: z.enum(['standard', 'more']).exactOptional(),
    density: z.enum(['comfortable', 'compact']).exactOptional(),
  }).exactOptional(),
  accessibility: z.looseObject({
    reduceMotion: z.boolean().exactOptional(),
    largeText: z.boolean().exactOptional(),
    screenReaderOptimized: z.boolean().exactOptional(),
  }).exactOptional(),
  notificationDelivery: z.looseObject({
    email: z.boolean().exactOptional(),
    push: z.boolean().exactOptional(),
    inApp: z.boolean().exactOptional(),
  }).exactOptional(),
});
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const row = z.looseObject({
  tenant_id: uuid,
  subject_id: text,
  display_name: text.nullable(),
  avatar_document_id: text.nullable(),
  preference_overrides: overrides,
  revision: z.union([text, z.number()]),
  created_at: timestamp,
  updated_at: timestamp,
});
export type PreferencesRow = z.output<typeof row>;

export const readPreferences = defineQuery({
  name: 'preferences.read',
  text: sql`select tenant_id, subject_id, display_name, avatar_document_id, preference_overrides, revision, created_at, updated_at from profile.subject_preferences where tenant_id = $1::uuid and subject_id = $2`,
  params: z.tuple([uuid, text]),
  row,
  expects: 'many',
});
export const insertPreferences = defineQuery({
  name: 'preferences.insert',
  text: sql`insert into profile.subject_preferences (tenant_id, subject_id, display_name, avatar_document_id, preference_overrides, revision) values ($1::uuid,$2,$3,$4,$5::jsonb,1) on conflict (tenant_id,subject_id) do nothing returning *`,
  params: z.tuple([uuid, text, text.nullable(), text.nullable(), text]),
  row,
  expects: 'many',
});
export const updatePreferences = defineQuery({
  name: 'preferences.update',
  text: sql`update profile.subject_preferences set display_name=$3, avatar_document_id=$4, preference_overrides=$5::jsonb, revision=revision+1, updated_at=clock_timestamp() where tenant_id=$1::uuid and subject_id=$2 and revision=$6 returning *`,
  params: z.tuple([uuid, text, text.nullable(), text.nullable(), text, z.number()]),
  row,
  expects: 'many',
});
