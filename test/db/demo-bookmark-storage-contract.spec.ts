import { describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../packages/data/test/support/postgres';
import {
  installDemoBookmarkStorage,
  renderDemoBookmarkStorage,
  verifyDemoBookmarkStorage,
} from '../../scripts/lib/demo-bookmark-storage.mjs';

const require = createRequire(resolve(__dirname, '../../packages/data/package.json'));
type PgClient = Awaited<ReturnType<PostgresTestDatabase['connectAsAdmin']>>;
const { Client } = require('pg') as { Client: new (connectionString: string) => PgClient };
const repoRoot = resolve(__dirname, '../..');
const bookmark = 'demo.demo__bookmark_bookmark';
const tag = 'demo.demo__bookmark_bookmark_tag';
const tenantA = 'a1111111-1111-4111-8111-111111111111';
const tenantB = 'b2222222-2222-4222-8222-222222222222';
const actor = 'c3333333-3333-4333-8333-333333333333';

interface Fixture {
  database: PostgresTestDatabase;
  admin: PgClient;
  owner: PgClient;
  connect(role: string): Promise<PgClient>;
}

async function withFixture(run: (fixture: Fixture) => Promise<void>) {
  const database = await createPostgresTestDatabase('stynx_demo_contract', { useTemplate: false });
  const clients: PgClient[] = [];
  try {
    const admin = await database.connectAsAdmin();
    clients.push(admin);
    const directory = resolve(repoRoot, 'packages/data/migrations/platform');
    const migrations = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const filename of migrations) {
      await admin.query(await readFile(resolve(directory, filename), 'utf8'));
      if (filename === '0002_extensions.sql') await admin.query('set role stynx_owner');
    }
    await admin.query('reset role');
    await database.ensureRoleLogin('stynx_owner');
    await database.ensureRoleLogin('stynx_reader');
    const connect = async (role: string) => {
      const client = new Client(database.appConnectionString('demo-contract-inspector', role));
      clients.push(client);
      await client.connect();
      const identity = await client.query('select current_user, session_user');
      expect(identity.rows).toEqual([{ current_user: role, session_user: role }]);
      return client;
    };
    const owner = await connect('stynx_owner');
    await run({ database, admin, owner, connect });
  } finally {
    await Promise.all(clients.map((client) => client.end()));
    await database.dispose();
  }
}

async function install(owner: PgClient) {
  await owner.query('begin');
  try {
    const result = await installDemoBookmarkStorage(owner);
    await owner.query('commit');
    return result;
  } catch (error) {
    await owner.query('rollback');
    throw error;
  }
}

async function readOnlyVerification(owner: PgClient) {
  await owner.query('begin read only');
  try {
    const result = await verifyDemoBookmarkStorage(owner);
    await owner.query('commit');
    return result;
  } catch (error) {
    await owner.query('rollback');
    throw error;
  }
}

async function context<T>(client: PgClient, tenant: string, run: () => Promise<T>): Promise<T> {
  await client.query('begin');
  try {
    await client.query(
      "select set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true)",
      [tenant, actor],
    );
    const result = await run();
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function add(
  owner: PgClient,
  tenant: string,
  url: string,
  id = randomUUID(),
  deleted = false,
) {
  await owner.query(
    `insert into ${bookmark}(id,tenant_id,owner_id,url,title,notes,created_at,updated_at,deleted_at)
     values($1,$2,$3,$4,'Unicode ç 🌱','opaque retained notes', '2024-02-29T12:34:56.123456Z',
       '2025-01-02T03:04:05.654321Z',case when $5 then '2025-03-04T05:06:07.111222Z'::timestamptz else null end)`,
    [id, tenant, actor, url, deleted],
  );
  await owner.query(
    `insert into ${tag}(bookmark_id,tag,created_at) values($1,'ação','2024-02-29T12:34:56.987654Z')`,
    [id],
  );
  return id;
}

async function snapshot(owner: PgClient) {
  return {
    bookmarks: (await owner.query(`select to_jsonb(b) as row from ${bookmark} b order by id`)).rows,
    tags: (await owner.query(`select to_jsonb(t) as row from ${tag} t order by bookmark_id,tag`))
      .rows,
  };
}

// ADR-DOMAIN-STORAGE-0001, INV-RBAC-001 and INV-PRIVACY-001.
describe('closed demo bookmark storage contract', () => {
  it('renders both exact immutable migrations without escaping the caller transaction', async () => {
    const rendered = renderDemoBookmarkStorage();
    expect(rendered.contractVersion).toBe('demo-bookmark-storage/1');
    expect(Object.isFrozen(rendered)).toBe(true);
    expect(Object.isFrozen(rendered.sources)).toBe(true);
    for (const source of rendered.sources) {
      expect(Object.isFrozen(source)).toBe(true);
      const bytes = await readFile(resolve(repoRoot, source.path));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(source.sha256);
    }
    expect(rendered.sources.map((source: { path: string }) => source.path)).toEqual([
      'domain/demo-bookmark/db/migration.sql',
      'domain/demo-bookmark/db/0002_tenant_rls.sql',
    ]);
    expect(rendered.sql).not.toMatch(/^\s*(BEGIN|COMMIT);\s*$/m);
    expect(createHash('sha256').update(rendered.sql).digest('hex')).toBe(
      rendered.renderedSqlSha256,
    );
    expect(rendered.historicalModelDifferences).toHaveLength(3);
  });

  it('fresh installs and independently verifies after commit; exact repeats preserve stored bytes', async () => {
    await withFixture(async ({ owner }) => {
      const first = await install(owner);
      expect(first.previousState).toBe('absent');
      expect(first.verification.supported).toBe(true);
      expect((await readOnlyVerification(owner)).supported).toBe(true);
      await add(owner, tenantA, 'https://example.test/fresh');
      const before = await snapshot(owner);
      const registration = (
        await owner.query("select to_jsonb(p) as row from core.pii_map p where table_schema='demo'")
      ).rows;
      expect(registration).toHaveLength(1);
      expect((await install(owner)).previousState).toBe('installed');
      expect(await snapshot(owner)).toEqual(before);
      expect(
        (
          await owner.query(
            "select to_jsonb(p) as row from core.pii_map p where table_schema='demo'",
          )
        ).rows,
      ).toEqual(registration);
      expect((await readOnlyVerification(owner)).supported).toBe(true);
    });
  });

  it('upgrades populated historical storage with exact ID, microsecond timestamp and deleted-row reconciliation', async () => {
    await withFixture(async ({ owner }) => {
      await owner.query(
        await readFile(resolve(repoRoot, 'domain/demo-bookmark/db/migration.sql'), 'utf8'),
      );
      await add(owner, tenantA, 'https://example.test/shared');
      await add(owner, tenantB, 'https://example.test/shared');
      await add(owner, tenantA, 'https://example.test/shared', randomUUID(), true);
      const before = await snapshot(owner);
      const result = await install(owner);
      expect(result.previousState).toBe('historical');
      expect(await snapshot(owner)).toEqual(before);
      expect((await readOnlyVerification(owner)).supported).toBe(true);
      expect((await install(owner)).previousState).toBe('installed');
      expect(await snapshot(owner)).toEqual(before);
    });
  });

  it('actual caller rollback removes fresh installation and registration; retry then succeeds', async () => {
    await withFixture(async ({ owner }) => {
      await owner.query('begin');
      expect((await installDemoBookmarkStorage(owner)).verification.supported).toBe(true);
      await owner.query('rollback');
      expect((await owner.query("select to_regnamespace('demo')::text as name")).rows).toEqual([
        { name: null },
      ]);
      expect(
        (
          await owner.query(
            "select count(*)::integer as count from core.pii_map where table_schema='demo'",
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect((await install(owner)).previousState).toBe('absent');
    });
  });

  it('refuses an actual restricted installer before mutation', async () => {
    await withFixture(async ({ owner, connect }) => {
      const app = await connect('stynx_app');
      await expect(install(app)).rejects.toThrow('actual fixed owner');
      expect((await owner.query("select to_regnamespace('demo')::text as name")).rows).toEqual([
        { name: null },
      ]);
    });
  });

  it('actual two-tenant app and reader logins enforce context, CRUD, parent tags and restricted grants', async () => {
    await withFixture(async ({ owner, connect }) => {
      await install(owner);
      const ids = [
        await add(owner, tenantA, 'https://example.test/a'),
        await add(owner, tenantB, 'https://example.test/b'),
      ];
      const identities = [
        { tenant: tenantA, own: ids[0], other: ids[1] },
        { tenant: tenantB, own: ids[1], other: ids[0] },
      ];
      for (const identity of identities) {
        const app = await connect('stynx_app');
        const reader = await connect('stynx_reader');
        for (const client of [app, reader]) {
          expect((await client.query(`select id from ${bookmark}`)).rows).toEqual([]);
          expect((await client.query(`select bookmark_id from ${tag}`)).rows).toEqual([]);
          await context(client, identity.tenant, async () => {
            expect((await client.query(`select id from ${bookmark} order by id`)).rows).toEqual([
              { id: identity.own },
            ]);
            expect((await client.query(`select bookmark_id from ${tag}`)).rows).toEqual([
              { bookmark_id: identity.own },
            ]);
          });
          expect((await client.query(`select id from ${bookmark}`)).rows).toEqual([]);
          await expect(
            context(client, 'invalid-uuid', () => client.query(`select id from ${bookmark}`)),
          ).rejects.toMatchObject({ code: '22P02' });
        }
        for (const tenant of ['', identity.tenant === tenantA ? tenantB : tenantA]) {
          await expect(
            context(app, tenant, () =>
              app.query(`insert into ${bookmark}(tenant_id,owner_id,url) values($1,$2,$3)`, [
                identity.tenant,
                actor,
                'https://example.test/refused',
              ]),
            ),
          ).rejects.toMatchObject({ code: '42501' });
        }
        await context(app, identity.tenant, async () => {
          expect(
            (
              await app.query(`update ${bookmark} set title='forbidden' where id=$1`, [
                identity.other,
              ])
            ).rowCount,
          ).toBe(0);
          expect(
            (await app.query(`delete from ${bookmark} where id=$1`, [identity.other])).rowCount,
          ).toBe(0);
          const inserted = await app.query(
            `insert into ${bookmark}(tenant_id,owner_id,url) values($1,$2,$3) returning id`,
            [identity.tenant, actor, 'https://example.test/crud'],
          );
          const id = inserted.rows[0].id;
          expect(
            (
              await app.query(`update ${bookmark} set title='edited' where id=$1 returning title`, [
                id,
              ])
            ).rows,
          ).toEqual([{ title: 'edited' }]);
          expect(
            (await app.query(`insert into ${tag}(bookmark_id,tag) values($1,'first')`, [id]))
              .rowCount,
          ).toBe(1);
          expect(
            (await app.query(`update ${tag} set tag='second' where bookmark_id=$1`, [id])).rowCount,
          ).toBe(1);
          expect((await app.query(`delete from ${tag} where bookmark_id=$1`, [id])).rowCount).toBe(
            1,
          );
          await app.query(`insert into ${tag}(bookmark_id,tag) values($1,'cascade')`, [id]);
          expect((await app.query(`delete from ${bookmark} where id=$1`, [id])).rowCount).toBe(1);
          expect(
            (await app.query(`select tag from ${tag} where bookmark_id=$1`, [id])).rows,
          ).toEqual([]);
        });
        await expect(
          context(app, identity.tenant, () =>
            app.query(`insert into ${tag}(bookmark_id,tag) values($1,'forbidden')`, [
              identity.other,
            ]),
          ),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          context(app, identity.tenant, () =>
            app.query(`update ${tag} set bookmark_id=$1 where bookmark_id=$2`, [
              identity.other,
              identity.own,
            ]),
          ),
        ).rejects.toMatchObject({ code: '42501' });
        const forbidden = [
          `insert into ${bookmark}(tenant_id,owner_id,url) values('${identity.tenant}','${actor}','https://example.test/reader')`,
          `update ${bookmark} set title='forbidden'`,
          `delete from ${bookmark}`,
          `insert into ${tag}(bookmark_id,tag) values('${identity.own}','reader')`,
          `update ${tag} set tag='reader'`,
          `delete from ${tag}`,
          `truncate ${bookmark} cascade`,
          'create table demo.forbidden(id integer)',
        ];
        for (const sql of forbidden)
          await expect(
            context(reader, identity.tenant, () => reader.query(sql)),
          ).rejects.toMatchObject({ code: '42501' });
        await expect(
          context(app, identity.tenant, () => app.query(`truncate ${bookmark} cascade`)),
        ).rejects.toMatchObject({ code: '42501' });
        await expect(
          context(app, identity.tenant, () => app.query('create table demo.forbidden(id integer)')),
        ).rejects.toMatchObject({ code: '42501' });
      }
      expect((await snapshot(owner)).bookmarks.map((row) => row.row.id).sort()).toEqual(
        [...ids].sort(),
      );
    });
  });

  it('retains active URL uniqueness, cross-tenant reuse, soft history and actual tag compound key/cascade', async () => {
    await withFixture(async ({ owner, connect }) => {
      await install(owner);
      const app = await connect('stynx_app');
      const id = await add(owner, tenantA, 'https://example.test/unique');
      await expect(
        context(app, tenantA, () =>
          app.query(`insert into ${bookmark}(tenant_id,owner_id,url) values($1,$2,$3)`, [
            tenantA,
            actor,
            'https://example.test/unique',
          ]),
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        context(app, tenantA, () =>
          app.query(`insert into ${tag}(bookmark_id,tag) values($1,'ação')`, [id]),
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await add(owner, tenantB, 'https://example.test/unique');
      await context(app, tenantA, async () => {
        await app.query(`update ${bookmark} set deleted_at='2026-01-02T03:04:05Z' where id=$1`, [
          id,
        ]);
        expect((await app.query(`select id from ${bookmark} where id=$1`, [id])).rows).toEqual([
          { id },
        ]);
        expect((await app.query(`select tag from ${tag} where bookmark_id=$1`, [id])).rows).toEqual(
          [{ tag: 'ação' }],
        );
        const replacement = await app.query(
          `insert into ${bookmark}(tenant_id,owner_id,url) values($1,$2,$3) returning id`,
          [tenantA, actor, 'https://example.test/unique'],
        );
        expect(replacement.rowCount).toBe(1);
        await app.query(`delete from ${bookmark} where id=$1`, [id]);
        expect((await app.query(`select tag from ${tag} where bookmark_id=$1`, [id])).rows).toEqual(
          [],
        );
      });
    });
  });

  const catalogMutations = [
    ['extra table', 'create table demo.unrecognized(id integer)', 'closed-relation-population'],
    [
      'extra view',
      `create view demo.unrecognized as select id from ${bookmark}`,
      'closed-relation-population',
    ],
    ['extra sequence', 'create sequence demo.unrecognized', 'closed-relation-population'],
    ['unlogged table', `alter table ${tag} set unlogged`, 'closed-relation-population'],
    [
      'outside-schema inheritance child',
      `create schema outsider authorization stynx_owner; create table outsider.child() inherits (${bookmark})`,
      'no-table-inheritance',
    ],
    [
      'RLS disabled',
      `alter table ${bookmark} disable row level security`,
      'closed-relation-population',
    ],
    [
      'FORCE RLS disabled',
      `alter table ${bookmark} no force row level security`,
      'closed-relation-population',
    ],
    [
      'extra permissive policy',
      `create policy unknown on ${bookmark} using(true)`,
      'demo__bookmark_bookmark:tenant-policy',
    ],
    [
      'altered policy predicate',
      `alter policy demo_bookmark_tenant_isolation on ${bookmark} using(true)`,
      'demo__bookmark_bookmark:tenant-policy',
    ],
    [
      'altered policy roles',
      `alter policy demo_bookmark_tenant_isolation on ${bookmark} to public`,
      'demo__bookmark_bookmark:tenant-policy',
    ],
    [
      'column-only reader write',
      `grant update(title) on ${bookmark} to stynx_reader`,
      'demo__bookmark_bookmark:effective-column-grants',
    ],
    [
      'column-only application references',
      `grant references(title) on ${bookmark} to stynx_app`,
      'demo__bookmark_bookmark:effective-column-grants',
    ],
    [
      'PUBLIC column access',
      `grant select(title) on ${bookmark} to public`,
      'demo__bookmark_bookmark:effective-column-grants',
    ],
    [
      'schema creation privilege',
      'grant create on schema demo to stynx_app',
      'schema-owner-and-grants',
    ],
    [
      'wrong index key order',
      `drop index demo.ix_bookmark_tenant_owner; create index ix_bookmark_tenant_owner on ${bookmark}(owner_id,tenant_id)`,
      'demo__bookmark_bookmark:indexes',
    ],
    [
      'wrong index collation',
      `drop index demo.ix_bookmark_tenant_url; create unique index ix_bookmark_tenant_url on ${bookmark}(tenant_id,url collate "C") where deleted_at is null`,
      'demo__bookmark_bookmark:indexes',
    ],
    [
      'wrong unique predicate',
      `drop index demo.ix_bookmark_tenant_url; create unique index ix_bookmark_tenant_url on ${bookmark}(tenant_id,url) where deleted_at is not null`,
      'demo__bookmark_bookmark:indexes',
    ],
    [
      'PII registration missing',
      "delete from core.pii_map where table_schema='demo'",
      'canonical-pii-registration',
    ],
    [
      'PII registration changed',
      "update core.pii_map set strategy='delete_row' where table_schema='demo'",
      'canonical-pii-registration',
    ],
    [
      'PII registration extra protected column',
      "insert into core.pii_map(table_schema,table_name,column_name,strategy) values('demo','demo__bookmark_bookmark','title','nullify')",
      'canonical-pii-registration',
    ],
  ] as const;

  for (const [name, sql, expectedCheck] of catalogMutations) {
    it(`refuses catalog tampering without silent repair: ${name}`, async () => {
      await withFixture(async ({ owner }) => {
        await install(owner);
        await add(owner, tenantA, 'https://example.test/tamper');
        await owner.query(sql);
        const before = await snapshot(owner);
        const verification = await readOnlyVerification(owner);
        expect(verification.supported).toBe(false);
        expect(verification.checks).toContainEqual(
          expect.objectContaining({ id: expectedCheck, status: 'fail' }),
        );
        await expect(install(owner)).rejects.toThrow('unrecognized existing shape');
        expect(await snapshot(owner)).toEqual(before);
        expect((await readOnlyVerification(owner)).checks).toEqual(verification.checks);
      });
    });
  }

  it('refuses a partial historical schema instead of completing it', async () => {
    await withFixture(async ({ owner }) => {
      await owner.query('create schema demo authorization stynx_owner');
      await owner.query(`create table ${bookmark}(id uuid primary key)`);
      await expect(install(owner)).rejects.toThrow('unrecognized existing shape');
      expect((await owner.query(`select to_regclass('${tag}')::text as name`)).rows).toEqual([
        { name: null },
      ]);
    });
  });

  it('refuses inherited maintenance privilege and leaves existing data unchanged', async () => {
    await withFixture(async ({ admin, owner }) => {
      await install(owner);
      await add(owner, tenantA, 'https://example.test/inherited');
      const role = `demo_fixture_${randomUUID().replaceAll('-', '')}`;
      await admin.query(`create role ${role} nologin`);
      try {
        await owner.query(`grant truncate on ${bookmark} to ${role}`);
        await admin.query(`grant ${role} to stynx_reader with inherit true`);
        const before = await snapshot(owner);
        const result = await readOnlyVerification(owner);
        expect(result.supported).toBe(false);
        expect(result.checks).toContainEqual(
          expect.objectContaining({
            id: 'demo__bookmark_bookmark:effective-table-grants',
            status: 'fail',
          }),
        );
        await expect(install(owner)).rejects.toThrow('unrecognized existing shape');
        expect(await snapshot(owner)).toEqual(before);
      } finally {
        await admin.query(`revoke ${role} from stynx_reader`);
        await owner.query(`revoke all on ${bookmark} from ${role}`);
        await admin.query(`drop role ${role}`);
      }
    });
  });
});
