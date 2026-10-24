import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

const text = z.string();

export const identityUsername = defineQuery({
  name: 'backend.identityUsername',
  text: sql`SELECT external_id FROM auth.users WHERE user_id = $1`,
  params: z.tuple([text]),
  row: z.object({ external_id: text.nullable().optional() }),
  expects: 'many',
});

export const upsertIdentityRole = defineQuery({
  name: 'backend.upsertIdentityRole',
  text: sql`INSERT INTO auth.roles (code, description)
             VALUES ($1, $2)
             ON CONFLICT (code) DO UPDATE
               SET description = COALESCE(EXCLUDED.description, description)
             RETURNING role_id`,
  params: z.tuple([text, text]),
  row: z.object({ role_id: text }),
  expects: 'many',
});

export const upsertIdentityUser = defineQuery({
  name: 'backend.upsertIdentityUser',
  text: sql`INSERT INTO auth.users (
             user_id,
             external_id,
             email,
             display_name,
             status,
             meta
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT (user_id) DO UPDATE
             SET external_id = EXCLUDED.external_id,
                 email = EXCLUDED.email,
                 display_name = EXCLUDED.display_name,
                 status = COALESCE(EXCLUDED.status, status),
                 meta = EXCLUDED.meta`,
  params: z.tuple([text, text, text.nullable(), text, text.nullable(), text]),
  row: z.object({}),
  expects: 'none',
});

export const insertIdentityMembership = defineQuery({
  name: 'backend.insertIdentityMembership',
  text: sql`INSERT INTO auth.user_roles (user_id, role_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
  params: z.tuple([text, text]),
  row: z.object({}),
  expects: 'none',
});

