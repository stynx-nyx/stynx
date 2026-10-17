import { Client } from 'pg';
import { createPostgresTestDatabase } from '../support/postgres';

describe('PostgreSQL fixture bootstrap without a migrated template', () => {
  it('preserves escaped direct-role credentials and the Unix socket endpoint', async () => {
    const postgres = await createPostgresTestDatabase('stynx_fixture_socket_uri', {
      useTemplate: false,
    });
    try {
      vi.stubEnv('STYNX_TEST_PG_HOST', undefined);
      vi.stubEnv('STYNX_TEST_PG_SOCKET_DIR', '/tmp/fixture socket é');
      vi.stubEnv('STYNX_TEST_PG_PASSWORD', 'fixture:@/% é');
      const app = new Client({
        connectionString: postgres.appConnectionString('fixture socket credentials'),
      });
      expect(Reflect.get(app, 'connectionParameters')).toMatchObject({
        host: '/tmp/fixture socket é',
        database: postgres.database,
        user: 'stynx_app',
        password: 'fixture:@/% é',
        application_name: 'fixture socket credentials',
      });
    } finally {
      vi.unstubAllEnvs();
      await postgres.dispose();
    }
  });

  it('serializes shared role setup across concurrently owned databases', async () => {
    const count = 8;
    const outcomes = await Promise.allSettled(
      Array.from({ length: count }, () =>
        createPostgresTestDatabase('stynx_fixture_parallel', { useTemplate: false }),
      ),
    );
    const databases = outcomes.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? [outcome.value] : [],
    );
    try {
      expect(outcomes.map((outcome) => outcome.status)).toEqual(
        Array.from({ length: count }, () => 'fulfilled'),
      );
      await Promise.all(
        databases.map(async (postgres) => {
          const admin = await postgres.connectAsAdmin();
          const app = new Client({
            connectionString: postgres.appConnectionString('parallel-fixture-login'),
          });
          try {
            const bootstrap = await admin.query(
              `select current_database()::text as database,
                      to_regclass('core.schema_migrations')::text as ledger,
                      has_database_privilege('stynx_owner', current_database(), 'CREATE') as owner_create`,
            );
            expect(bootstrap.rows).toEqual([
              { database: postgres.database, ledger: null, owner_create: true },
            ]);
            await app.connect();
            const identity = await app.query(
              `select current_user::text, session_user::text from pg_catalog.pg_roles
                where rolname = current_user and not rolsuper and not rolbypassrls`,
            );
            expect(identity.rows).toEqual([
              { current_user: 'stynx_app', session_user: 'stynx_app' },
            ]);
          } finally {
            await app.end();
            await admin.end();
          }
        }),
      );
    } finally {
      await Promise.all(databases.map((postgres) => postgres.dispose()));
    }
  });

  it('provides a restricted direct login while leaving database migrations unapplied', async () => {
    const postgres = await createPostgresTestDatabase('stynx_fixture_bootstrap', {
      useTemplate: false,
    });
    const admin = await postgres.connectAsAdmin();
    const app = new Client({ connectionString: postgres.appConnectionString('fixture-login') });
    try {
      const schema = await admin.query(
        `select to_regclass('core.schema_migrations')::text as ledger,
                to_regclass('tenancy.tenants')::text as tenants`,
      );
      expect(schema.rows).toEqual([{ ledger: null, tenants: null }]);
      const grants = await admin.query(
        `select has_database_privilege('stynx_owner', current_database(), 'CREATE') as owner_create,
                has_database_privilege('stynx_app', current_database(), 'CONNECT') as app_connect`,
      );
      expect(grants.rows).toEqual([{ owner_create: true, app_connect: true }]);
      await app.connect();
      const identity = await app.query(
        `select current_user::text, session_user::text, r.rolsuper, r.rolbypassrls, r.rolcanlogin
           from pg_catalog.pg_roles r where r.rolname = current_user`,
      );
      expect(identity.rows).toEqual([
        {
          current_user: 'stynx_app',
          session_user: 'stynx_app',
          rolsuper: false,
          rolbypassrls: false,
          rolcanlogin: true,
        },
      ]);
    } finally {
      await app.end();
      await admin.end();
      await postgres.dispose();
    }
  });
});
