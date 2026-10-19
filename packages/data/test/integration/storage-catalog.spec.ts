import { randomUUID } from 'node:crypto';
import { collectStorageCatalog } from '../../src/storage-catalog.js';
import type { StorageVerifierTransaction } from '../../src/storage-contract.js';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../support/postgres.js';

// Real catalog introspection proves effective SQL support, preserving column ACL,
// function/trigger flags, enum order, RLS policies and owner default grants.
describe('read-only storage catalog PostgreSQL introspection', () => {
  let pg: PostgresTestDatabase;
  const reader = `catalog_reader_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  beforeAll(async () => {
    pg = await createPostgresTestDatabase('stynx_storage_catalog', { useTemplate: false });
  }, 60_000);
  afterAll(async () => {
    if (!pg) return;
    const admin = await pg.connectAsAdmin();
    try {
      await admin.query(`drop owned by "${reader}" cascade`);
      await admin.query(`drop role "${reader}"`);
    } finally {
      await admin.end();
      await pg.dispose();
    }
  }, 60_000);

  it('collects exact security metadata and leaves rows, sequence state and transaction ownership untouched', async () => {
    const admin = await pg.connectAsAdmin();
    try {
      await admin.query(`create role "${reader}" nologin nosuperuser nobypassrls`);
      await admin.query(`create schema "catalog ação";
        create type "catalog ação".state as enum ('second','first');
        create table "catalog ação".items(id integer primary key, tenant_id uuid not null, raw_body bytea, state "catalog ação".state default 'second');
        create sequence "catalog ação".cursor_seq start 17 increment 3;
        alter table "catalog ação".items enable row level security;
        alter table "catalog ação".items force row level security;
        create policy tenant_policy on "catalog ação".items for select to "${reader}" using (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
        create function "catalog ação".touch() returns trigger language plpgsql security definer set search_path=pg_catalog as $$begin return new; end$$;
        create trigger update_guard before update on "catalog ação".items for each row execute function "catalog ação".touch();
        create index raw_idx on "catalog ação".items(tenant_id);
        grant usage on schema "catalog ação" to "${reader}";
        grant select on "catalog ação".items to "${reader}";
        grant update(raw_body) on "catalog ação".items to "${reader}";
        alter default privileges in schema "catalog ação" grant select on tables to "${reader}";
        insert into "catalog ação".items(id,tenant_id,raw_body) values(1,'00000000-0000-4000-8000-000000000001',decode('abcd','hex'));`);
      const beforeRows = (
        await admin.query('select to_jsonb(i)::text as row from "catalog ação".items i')
      ).rows;
      const beforeSequence = (
        await admin.query('select last_value,is_called from "catalog ação".cursor_seq')
      ).rows;
      await admin.query('begin read only');
      const beforeTx = (
        await admin.query(
          "select pg_current_xact_id_if_assigned()::text as id, current_setting('transaction_read_only') as readonly",
        )
      ).rows;
      const catalog = await collectStorageCatalog(
        admin as unknown as StorageVerifierTransaction,
        'catalog ação',
      );
      expect(catalog).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'relation',
            name: 'items',
            value: expect.objectContaining({ rls: true, forceRls: true }),
          }),
          expect.objectContaining({
            kind: 'column',
            name: 'items.tenant_id',
            value: expect.objectContaining({ notNull: true, type: 'uuid' }),
          }),
          expect.objectContaining({ kind: 'constraint', name: 'items.items_pkey' }),
          expect.objectContaining({ kind: 'index', name: 'raw_idx' }),
          expect.objectContaining({
            kind: 'policy',
            name: 'items.tenant_policy',
            value: expect.objectContaining({ roles: [reader], command: 'r', permissive: true }),
          }),
          expect.objectContaining({
            kind: 'trigger',
            name: 'items.update_guard',
            value: expect.objectContaining({
              enabled: 'O',
              functionSchema: 'catalog ação',
              function: 'touch',
            }),
          }),
          expect.objectContaining({
            kind: 'function',
            name: 'touch()',
            value: expect.objectContaining({
              securityDefiner: true,
              config: ['search_path=pg_catalog'],
              volatility: 'v',
              strict: false,
              leakproof: false,
            }),
          }),
          expect.objectContaining({
            kind: 'enum',
            name: 'state',
            value: expect.objectContaining({ labels: ['second', 'first'] }),
          }),
          expect.objectContaining({
            kind: 'sequence',
            name: 'cursor_seq',
            value: expect.objectContaining({ start: '17', increment: '3', cycle: false }),
          }),
          expect.objectContaining({
            kind: 'grant',
            name: `items.raw_body:${reader}:UPDATE`,
            value: expect.objectContaining({ grantable: false }),
          }),
          expect.objectContaining({
            kind: 'default-grant',
            value: expect.objectContaining({
              grantee: reader,
              privilege: 'SELECT',
              grantable: false,
            }),
          }),
        ]),
      );
      expect(
        (
          await admin.query(
            "select pg_current_xact_id_if_assigned()::text as id, current_setting('transaction_read_only') as readonly",
          )
        ).rows,
      ).toEqual(beforeTx);
      expect(
        (await admin.query('select to_jsonb(i)::text as row from "catalog ação".items i')).rows,
      ).toEqual(beforeRows);
      expect(
        (await admin.query('select last_value,is_called from "catalog ação".cursor_seq')).rows,
      ).toEqual(beforeSequence);
      expect(
        await collectStorageCatalog(
          admin as unknown as StorageVerifierTransaction,
          'absent schema',
        ),
      ).toEqual([]);
      await admin.query('rollback');
    } finally {
      await admin.end();
    }
  }, 60_000);
});
