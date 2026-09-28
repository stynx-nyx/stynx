/** INV-CLI-003, INV-CLI-004, INV-RBAC-001: executed only from the packed external consumer. */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { ModuleRef, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Client, type ClientConfig } from 'pg';
import request from 'supertest';
import { PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { generateRequestId, RequestContextMutator } from '@stynx-nyx/core';
import { StynxDataModule } from '@stynx-nyx/data';
import { SessionService } from '@stynx-nyx/sessions';
import { CrudProbeModule } from './generated/src/crud_probe.module';
import { CrudProbeRepository } from './generated/src/crud_probe.repository';
import { readFileSync } from 'node:fs';

const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const actorA = '33333333-3333-4333-8333-333333333333';
const actorB = '44444444-4444-4444-8444-444444444444';
const prefix = 'stynx_cli_' + randomUUID().replaceAll('-', '').slice(0, 16);
const ddlPath = process.env.STYNX_CLI_GENERATED_DDL;
if (!ddlPath) throw new Error('STYNX_CLI_GENERATED_DDL is required');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function adminConfig(database = 'postgres'): ClientConfig {
  return {
    host: process.env.STYNX_TEST_PG_HOST ?? process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp',
    port: Number(process.env.STYNX_TEST_PG_PORT ?? '5432'),
    user: process.env.STYNX_TEST_PG_USER ?? userInfo().username,
    password: process.env.STYNX_TEST_PG_PASSWORD,
    database,
  };
}
function appConfig(database: string): ClientConfig {
  return {
    host: process.env.STYNX_TEST_PG_HOST ?? process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp',
    port: Number(process.env.STYNX_TEST_PG_PORT ?? '5432'),
    user: 'stynx_app',
    password: process.env.STYNX_TEST_PG_APP_PASSWORD,
    database,
  };
}
function connectionString(config: ClientConfig): string {
  const host = String(config.host);
  const url = new URL(`postgresql://${encodeURIComponent(String(config.user))}@localhost:${config.port ?? 5432}/${config.database}`);
  if (config.password) url.password = String(config.password);
  if (host.startsWith('/')) url.searchParams.set('host', host);
  else url.hostname = host;
  return url.toString();
}
async function connect(config: ClientConfig): Promise<Client> {
  const client = new Client(config);
  await client.connect();
  return client;
}
async function expectStatus(req: request.Test, status: number): Promise<Record<string, unknown>> {
  const response = await req;
  assert(response.status === status, `${req.method} ${req.url} expected ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body as Record<string, unknown>;
}
function bearer(tenant: 'A' | 'B', permission: string): string {
  return `Bearer ${tenant}|${permission}`;
}
function authFor(tenant: 'A' | 'B', permission: string): { Authorization: string } {
  return { Authorization: bearer(tenant, permission) };
}
async function inTenant<T>(mutator: RequestContextMutator, tenantId: string | undefined, actorId: string | undefined, fn: () => Promise<T>): Promise<T> {
  return Promise.resolve(mutator.runWithRequestContext({
    requestId: generateRequestId(), startedAt: new Date(),
    ...(tenantId ? { tenantId } : {}), ...(actorId ? { actorId } : {}),
  }, fn));
}
async function directRoleProbe(client: Client): Promise<{ recordA: string; recordB: string; noteA: string }> {
  const current = await client.query<{ current_user: string }>('select current_user');
  assert(current.rows[0]?.current_user === 'stynx_app', 'direct SQL probe did not connect as stynx_app');
  async function insertFor(tenant: string, label: string): Promise<string> {
    await client.query('begin');
    try {
      await client.query("select set_config('app.tenant_id',$1,true)", [tenant]);
      await client.query("select set_config('app.actor_id',$1,true)", [actorA]);
      const row = await client.query<{ id: string }>('insert into cli_probe.record_item(tenant_id,label) values ($1,$2) returning id', [tenant, label]);
      await client.query('commit');
      return row.rows[0]!.id;
    } catch (error) { await client.query('rollback'); throw error; }
  }
  const recordA = await insertFor(tenantA, 'tenant-A');
  const recordB = await insertFor(tenantB, 'tenant-B');
  await client.query('begin');
  try {
    await client.query("select set_config('app.tenant_id',$1,true)", [tenantA]);
    await client.query("select set_config('app.actor_id',$1,true)", [actorA]);
    const note = await client.query<{ id: string }>('insert into cli_probe.note_item(tenant_id,message) values ($1,$2) returning id', [tenantA, 'A note']);
    const hidden = await client.query('select id from cli_probe.record_item where id=$1', [recordB]);
    assert(hidden.rowCount === 0, 'tenant A read tenant B row');
    const updated = await client.query("update cli_probe.record_item set label='leak' where id=$1 returning id", [recordB]);
    assert(updated.rowCount === 0, 'tenant A updated tenant B row');
    const deleted = await client.query('delete from cli_probe.record_item where id=$1 returning id', [recordB]);
    assert(deleted.rowCount === 0, 'tenant A deleted tenant B row');
    await client.query('commit');
    await client.query('begin');
    await client.query("select set_config('app.tenant_id',$1,true)", [tenantA]);
    await client.query("select set_config('app.actor_id',$1,true)", [actorA]);
    let rejectionCode: string | undefined;
    try { await client.query('insert into cli_probe.record_item(tenant_id,label) values ($1,$2)', [tenantB, 'forbidden']); }
    catch (error) { rejectionCode = (error as { code?: string }).code; }
    assert(rejectionCode === '42501', `cross-tenant INSERT did not fail with RLS privilege error: ${rejectionCode}`);
    await client.query('rollback');
    await client.query('begin');
    const noTenant = await client.query('select id from cli_probe.record_item');
    assert(noTenant.rowCount === 0, 'missing tenant setting exposed rows');
    await client.query('rollback');
    return { recordA, recordB, noteA: note.rows[0]!.id };
  } catch (error) { await client.query('rollback').catch(() => undefined); throw error; }
}
async function httpProbe(app: INestApplication, ids: { recordA: string; noteA: string }): Promise<void> {
  const http = app.getHttpServer();
  const item = `/v1/records/${ids.recordA}`;
  const note = `/v1/notes/${ids.noteA}`;
  const checks: Array<{ method: 'get' | 'post' | 'patch' | 'delete'; path: string; key: string; body?: object; status: number }> = [
    { method: 'get', path: '/v1/records', key: 'cli_probe.record_item.list', status: 200 },
    { method: 'get', path: item, key: 'cli_probe.record_item.get', status: 200 },
    { method: 'post', path: '/v1/records', key: 'cli_probe.record_item.create', body: { label: 'created', description: null, external_ref: null, quantity: 2, active: true, occurred_at: '2026-01-01T00:00:00Z' }, status: 201 },
    { method: 'patch', path: item, key: 'cli_probe.record_item.update', body: { label: 'updated' }, status: 200 },
    { method: 'delete', path: item, key: 'cli_probe.record_item.delete', status: 200 },
    { method: 'get', path: '/v1/notes', key: 'cli_probe.note_item.list', status: 200 },
    { method: 'get', path: note, key: 'cli_probe.note_item.get', status: 200 },
  ];
  const keys = new Set<string>();
  for (const check of checks) {
    assert(!keys.has(check.key), `duplicate route permission key ${check.key}`);
    keys.add(check.key);
    const denied = request(http)[check.method](check.path).set(authFor('A', 'none'));
    if (check.body) denied.send(check.body);
    await expectStatus(denied, 403);
    const allowed = request(http)[check.method](check.path).set(authFor('A', check.key));
    if (check.body) allowed.send(check.body);
    const result = await expectStatus(allowed, check.status);
    if (check.method === 'post') assert(result.tenant_id === tenantA, 'generated create did not use trusted context tenant');
  }
  const create = (body: object) => request(http).post('/v1/records').set(authFor('A', 'cli_probe.record_item.create')).send(body);
  await expectStatus(create({ label: 'bad', quantity: 'wrong' }), 400);
  await expectStatus(create({ quantity: 1 }), 400);
  await expectStatus(create({ label: 'x'.repeat(33) }), 400);
  await expectStatus(create({ label: 'ok', extra: true }), 400);
  await expectStatus(create({ label: 'ok', id: randomUUID() }), 400);
  await expectStatus(create({ label: 'ok', tenant_id: tenantB }), 400);
  const update = (body: object) => request(http).patch(item).set(authFor('A', 'cli_probe.record_item.update')).send(body);
  await expectStatus(update({ quantity: 'wrong' }), 400);
  await expectStatus(update({ tenant_id: tenantB }), 400);
  await expectStatus(request(http).get('/v1/records/not-a-uuid').set(authFor('A', 'cli_probe.record_item.get')), 400);
}
async function catalogProbe(admin: Client): Promise<void> {
  const tables = await admin.query<{ relname: string; relforcerowsecurity: boolean }>(`
    select c.relname,c.relforcerowsecurity from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='cli_probe' and c.relkind='r' order by c.relname`);
  assert(JSON.stringify(tables.rows.map((row) => row.relname)) === JSON.stringify(['note_item', 'record_item']), 'generated table set differs');
  assert(tables.rows.every((row) => row.relforcerowsecurity), 'generated table missing FORCE RLS');
  const tenantColumns = await admin.query<{ table_name: string; is_nullable: string; data_type: string }>(`
    select table_name,is_nullable,data_type from information_schema.columns
    where table_schema='cli_probe' and column_name='tenant_id' order by table_name`);
  assert(tenantColumns.rows.length === 2 && tenantColumns.rows.every((row) => row.is_nullable === 'NO' && row.data_type === 'uuid'), 'generated tenant columns are not non-null UUIDs');
  const tenantForeignKeys = await admin.query<{ table_name: string }>(`
    select c.relname as table_name from pg_constraint fk
    join pg_class c on c.oid=fk.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='cli_probe' and fk.contype='f'
      and fk.confrelid='tenancy.tenants'::regclass
      and pg_get_constraintdef(fk.oid) like '%tenant_id%'
    order by c.relname`);
  assert(JSON.stringify(tenantForeignKeys.rows.map((row) => row.table_name)) === JSON.stringify(['note_item', 'record_item']), 'generated tenant foreign keys differ');
  const tenantIndexes = await admin.query<{ tablename: string }>(`
    select tablename from pg_indexes
    where schemaname='cli_probe' and indexdef like '%(tenant_id)%'
    order by tablename`);
  assert(JSON.stringify(tenantIndexes.rows.map((row) => row.tablename)) === JSON.stringify(['note_item', 'record_item']), 'generated tenant index set differs');
  const policies = await admin.query<{ tablename: string; qual: string; with_check: string }>(`
    select tablename,qual,with_check from pg_policies where schemaname='cli_probe' order by tablename`);
  assert(policies.rows.length === 2, 'generated table policy set differs');
  for (const policy of policies.rows) {
    assert(policy.qual.includes("current_setting('app.tenant_id'"), `${policy.tablename} USING predicate lacks tenant`);
    assert(policy.with_check.includes("current_setting('app.tenant_id'"), `${policy.tablename} WITH CHECK predicate lacks tenant`);
  }
  const grants = await admin.query<{ grantee: string; privilege_type: string }>(`
    select grantee,privilege_type from information_schema.role_table_grants
    where table_schema='cli_probe' and table_name='record_item'`);
  assert(!grants.rows.some((row) => row.grantee === 'PUBLIC'), 'generated table granted PUBLIC privilege');
  assert(grants.rows.some((row) => row.grantee === 'stynx_app' && row.privilege_type === 'INSERT'), 'stynx_app missing CRUD grant');
  assert(grants.rows.some((row) => row.grantee === 'stynx_reader' && row.privilege_type === 'SELECT'), 'stynx_reader missing SELECT grant');
}
async function main(): Promise<void> {
  let postgres: Client | undefined;
  let admin: Client | undefined;
  let appRole: Client | undefined;
  let app: INestApplication | undefined;
  let created = false;
  try {
    postgres = await connect(adminConfig());
    await postgres.query(`create database "${prefix}"`);
    created = true;
    const adminCfg = adminConfig(prefix);
    const appCfg = appConfig(prefix);
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: connectionString(adminCfg) },
            app: { connectionString: connectionString(appCfg) },
            reader: { connectionString: connectionString(appCfg) },
          },
          migrations: { enabled: true },
        }),
        CrudProbeModule,
      ],
      providers: [PermissionGuard, { provide: SessionService, useValue: { get: async () => ({}) } }],
    }).compile();
    const nestApp = moduleRef.createNestApplication();
    app = nestApp;
    const fakeValidator = {
      validate: async (token: string) => {
        const [tenant, permission] = token.split('|');
        return {
          sub: tenant === 'B' ? actorB : actorA,
          sid: '55555555-5555-4555-8555-555555555555',
          tenantId: tenant === 'B' ? tenantB : tenantA,
          claims: { fixturePermission: permission },
        };
      },
    };
    const fakeCache = { getForSession: async (claims: { claims: { fixturePermission: string } }) => ({ permissions: [claims.claims.fixturePermission] }) };
    nestApp.useGlobalGuards(
      new StynxAuthGuard(moduleRef.get(ModuleRef), moduleRef.get(Reflector), fakeValidator as never, fakeCache as never),
      moduleRef.get(PermissionGuard),
    );
    await nestApp.init();
    admin = await connect(adminCfg);
    const ddl = readFileSync(ddlPath!, 'utf8');
    await admin.query('create schema "cli_probe"');
    const grantsBefore = await admin.query<{ nspacl: string | null }>("select nspacl::text as nspacl from pg_namespace where nspname='cli_probe'");
    await admin.query('begin');
    let existingSchemaFailed = false;
    try { await admin.query(ddl); } catch (error) { existingSchemaFailed = (error as { code?: string }).code === '42P06'; }
    await admin.query('rollback');
    assert(existingSchemaFailed, 'generated DDL did not fail on existing namespace');
    const before = await admin.query("select to_regclass('cli_probe.record_item') as table_name");
    assert(before.rows[0]?.table_name === null, 'existing-schema failure created a generated table');
    const grantsAfter = await admin.query<{ nspacl: string | null }>("select nspacl::text as nspacl from pg_namespace where nspname='cli_probe'");
    assert(grantsAfter.rows[0]?.nspacl === grantsBefore.rows[0]?.nspacl, 'existing-schema failure changed schema grants');
    await admin.query('drop schema "cli_probe"');
    await admin.query(ddl);
    await admin.query(`insert into tenancy.tenants(id,slug,name) values ($1,'cli-tenant-a','CLI Tenant A'),($2,'cli-tenant-b','CLI Tenant B')`, [tenantA, tenantB]);
    await catalogProbe(admin);
    appRole = await connect(appCfg);
    const ids = await directRoleProbe(appRole);
    const repository = moduleRef.get(CrudProbeRepository);
    const mutator = moduleRef.get(RequestContextMutator);
    const hiddenUpdate = await inTenant(mutator, tenantB, actorB, () => repository.updateRecordItem(ids.recordA, { label: 'cross-tenant' }));
    assert(hiddenUpdate === null, 'tenant B repository updated tenant A row');
    const hiddenDelete = await inTenant(mutator, tenantB, actorB, () => repository.deleteRecordItem(ids.recordA));
    assert(hiddenDelete === null, 'tenant B repository deleted tenant A row');
    let missingTenantFailed = false;
    try { await inTenant(mutator, undefined, actorA, () => repository.listRecordItem()); } catch { missingTenantFailed = true; }
    assert(missingTenantFailed, 'Database.tx accepted missing tenant context');
    let missingActorFailed = false;
    try { await inTenant(mutator, tenantA, undefined, () => repository.listRecordItem()); } catch { missingActorFailed = true; }
    assert(missingActorFailed, 'Database.tx accepted missing actor context');
    const retained = await admin.query<{ label: string }>('select label from cli_probe.record_item where id=$1', [ids.recordA]);
    assert(retained.rows[0]?.label === 'tenant-A', 'tenant A data changed after cross-tenant probes');
    await httpProbe(nestApp, ids);
    console.log('CTG8_CONSUMER_PASS');
  } finally {
    await appRole?.end().catch(() => undefined);
    await admin?.end().catch(() => undefined);
    await app?.close().catch(() => undefined);
    if (created && postgres) {
      await postgres.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()', [prefix]).catch(() => undefined);
      await postgres.query(`drop database if exists "${prefix}"`).catch(() => undefined);
    }
    await postgres?.end().catch(() => undefined);
  }
}
main().catch((error: unknown) => {
  const candidate = error as { code?: string; message?: string };
  if (['ECONNREFUSED', 'ENOTFOUND', 'ENOENT', 'ETIMEDOUT', '28P01', '28000'].includes(candidate.code ?? '')) {
    console.error(`CTG8_DB_UNOBSERVED: ${candidate.code}: ${candidate.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
