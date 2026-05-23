import { createDbRuntimeFixture, type DbRuntimeFixture } from './fixtures';

describe('db runtime extensions', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_extensions');
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('applies DDL and seed files in lexical order', () => {
    expect(fixture.appliedFiles).toEqual([
      'database/ddl/00-extensions.sql',
      'database/ddl/01-auth.sql',
      'database/ddl/02-audit.sql',
      'database/ddl/03-storage.sql',
      'database/seed/00-base.sql',
    ]);
  });

  it('loads the extensions declared by database/ddl/00-extensions.sql', async () => {
    const result = await fixture.client.query<{ extname: string }>(
      `
        select extname
        from pg_extension
        where extname in ('pgcrypto', 'uuid-ossp')
        order by extname
      `,
    );

    expect(result.rows.map((row) => row.extname)).toEqual(['pgcrypto', 'uuid-ossp']);
  });

  it('exposes functions backed by the declared extensions', async () => {
    const result = await fixture.client.query<{ pgcrypto_uuid: string; uuid_ossp_uuid: string }>(
      `
        select
          gen_random_uuid()::text as pgcrypto_uuid,
          uuid_generate_v4()::text as uuid_ossp_uuid
      `,
    );

    expect(result.rows[0]?.pgcrypto_uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.rows[0]?.uuid_ossp_uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
