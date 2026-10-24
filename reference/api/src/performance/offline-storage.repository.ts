import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

export const offlineInstallationAdmissionQuery = defineQuery({
  name: 'reference.offline.installation-admission',
  text: sql`select current_user::text as actor, to_regnamespace('offline') is not null as schema_exists`,
  params: z.tuple([]),
  row: z.object({ actor: z.string(), schema_exists: z.boolean() }),
  expects: 'one',
});

export const recordOfflineInstallationQuery = defineQuery({
  name: 'reference.offline.record-installation',
  text: sql`insert into core.app_schema_migrations(scope,id,checksum)
             values('http-performance-offline-storage',$1,$2)`,
  params: z.tuple([z.string(), z.string()]), row: z.object({}), expects: 'none',
});
