import { createDbRuntimeFixture, type DbRuntimeFixture } from '../runtime/fixtures';

const expectedLoadedExtensions = ['pgcrypto', 'uuid-ossp'];

describe('db invariant: extension list', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_inv_extensions');
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('loads exactly the current DDL-declared extensions beyond plpgsql', async () => {
    const extensions = await fixture.client.query<{ extname: string }>(
      `
        select extname
        from pg_extension
        where extname <> 'plpgsql'
        order by extname
      `,
    );

    expect(extensions.rows.map((row) => row.extname)).toEqual(expectedLoadedExtensions);
  });
});
