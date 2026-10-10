import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { renderOutboxStorage } from '../../packages/outbox/src/index';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

const migrations = resolve(__dirname, '../../packages/data/migrations/platform');

// Independent catalog projection: use real PostgreSQL metadata from each
// installation, rather than comparing either database to the shipped manifest.
async function catalog(client: Client) {
  const queries = {
    relations: `select c.relname,c.relkind,pg_get_userbyid(c.relowner) as owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='outbox' order by c.relname`,
    columns: `select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull,
      pg_get_expr(d.adbin,d.adrelid) as default_value from pg_attribute a join pg_class c on c.oid=a.attrelid
      join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
      where n.nspname='outbox' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`,
    constraints: `select c.relname,k.conname,pg_get_constraintdef(k.oid) as definition,k.convalidated
      from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='outbox' order by c.relname,k.conname`,
    indexes: `select tablename,indexname,indexdef from pg_indexes where schemaname='outbox' order by tablename,indexname`,
    functions: `select p.proname,pg_get_function_identity_arguments(p.oid) as args,pg_get_userbyid(p.proowner) as owner,
      pg_get_functiondef(p.oid) as definition,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='outbox' order by p.proname,args`,
    triggers: `select c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition,t.tgenabled
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='outbox' and not t.tgisinternal order by c.relname,t.tgname`,
    policies: `select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies
      where schemaname='outbox' order by tablename,policyname`,
    sequences: `select c.relname,s.seqtypid::regtype::text,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle
      from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='outbox' order by c.relname`,
  };
  const result: Record<string, unknown[]> = {};
  for (const [kind, sql] of Object.entries(queries)) result[kind] = (await client.query(sql)).rows;
  return result;
}

// ADR-OUTBOX-0003 D2; ADR-OUTBOX-0004 D4: independently generated default
// storage has the same closed catalog as the real complete platform chain.
describe('standalone outbox versus platform catalog equivalence', () => {
  it('matches objects, columns, constraints, indexes, functions, triggers, policies and grants through 0026', async () => {
    const platform = await createPostgresTestDatabase('stynx_obx_platform_catalog', {
      useTemplate: false,
    });
    const standalone = await createPostgresTestDatabase('stynx_obx_standalone_catalog', {
      useTemplate: false,
    });
    const canonical = await platform.connectAsAdmin();
    const rendered = await standalone.connectAsAdmin();
    try {
      const files = (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort();
      expect(files).toContain('0026_outbox_event_retirement.sql');
      for (const file of files) {
        await canonical.query(await readFile(resolve(migrations, file), 'utf8'));
        if (file === '0002_extensions.sql') await canonical.query('set role stynx_owner');
      }
      await canonical.query('reset role');
      await rendered.query(
        `grant connect,create on database ${rendered.escapeIdentifier(standalone.database)} to stynx_owner`,
      );
      await rendered.query('set role stynx_owner');
      await rendered.query(
        'create schema tenancy; create table tenancy.tenants(id uuid primary key)',
      );
      const artifact = renderOutboxStorage();
      await rendered.query(artifact.objectsSql);
      await rendered.query(artifact.roleBindingsSql);
      await rendered.query('reset role');
      const expected = await catalog(canonical);
      expect(expected.relations!.length).toBeGreaterThan(0);
      expect(expected.functions!.length).toBeGreaterThan(0);
      expect(expected.policies!.length).toBeGreaterThan(0);
      expect(await catalog(rendered)).toEqual(expected);
    } finally {
      await canonical.end();
      await rendered.end();
      await platform.dispose();
      await standalone.dispose();
    }
  });
});
