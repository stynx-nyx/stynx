import { createDbRuntimeFixture, type DbRuntimeFixture } from '../runtime/fixtures';

describe('db invariant: soft-delete archive mirrors', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_inv_soft_delete');
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('reports the current DDL soft-delete columns without expanding the policy contract', async () => {
    const softDeleteColumns = await fixture.client.query<{
      table_name: string;
      column_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `
        select
          table_schema || '.' || table_name as table_name,
          column_name,
          is_nullable,
          data_type
        from information_schema.columns
        where table_schema in ('auth', 'audit', 'storage')
          and column_name = 'deleted_at'
        order by table_schema, table_name, column_name
      `,
    );

    expect(softDeleteColumns.rows).toEqual([
      {
        table_name: 'storage.files',
        column_name: 'deleted_at',
        is_nullable: 'YES',
        data_type: 'timestamp with time zone',
      },
    ]);
  });

  it('keeps current DDL explicit: storage.files has no declared archive mirror table', async () => {
    const archiveMirrors = await fixture.client.query<{ table_name: string | null }>(
      `
        select candidate.table_name
        from (
          values
            ('storage.files_archive'),
            ('storage.files_archives'),
            ('storage.files_deleted'),
            ('storage.files_history')
        ) as candidate(table_name)
        where to_regclass(candidate.table_name) is not null
        order by candidate.table_name
      `,
    );

    expect(archiveMirrors.rows).toEqual([]);
  });
});
