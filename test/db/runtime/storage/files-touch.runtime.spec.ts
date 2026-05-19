import {
  canonicalSeedIds,
  createDbRuntimeFixture,
  type DbRuntimeFixture,
} from '../fixtures';

const tenantA = canonicalSeedIds.tenancy;
const tenantB = '00000000-0000-0000-0000-000000000002';
const explicitInsertedAt = '2026-01-02T03:04:05.000Z';

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

async function resetRuntimeContext(fixture: DbRuntimeFixture): Promise<void> {
  await fixture.client.query('reset role');
  await fixture.client.query('select auth.set_tenant(null)');
  await fixture.client.query('select auth.set_user_context(null, null)');
  await fixture.client.query('truncate table storage.files');
}

describe('storage.files runtime behavior', () => {
  let fixture: DbRuntimeFixture;
  let appRole: string;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_storage_files');
    appRole = `${fixture.database.database}_app`;

    await fixture.client.query(`create role ${quoteIdentifier(appRole)}`);
    await fixture.client.query(`grant usage on schema auth, storage to ${quoteIdentifier(appRole)}`);
    await fixture.client.query(
      `grant select, insert, update, delete on storage.files to ${quoteIdentifier(appRole)}`,
    );
  });

  beforeEach(async () => {
    await resetRuntimeContext(fixture);
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.client.query('reset role').catch(() => undefined);
      if (appRole) {
        await fixture.client.query(`drop owned by ${quoteIdentifier(appRole)}`).catch(() => undefined);
        await fixture.client.query(`drop role if exists ${quoteIdentifier(appRole)}`).catch(() => undefined);
      }
      await fixture.dispose();
    }
  });

  it('inserts a storage file with generated identity, defaults, and current-tenant enforcement', async () => {
    await fixture.client.query(`set role ${quoteIdentifier(appRole)}`);
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    await fixture.client.query('select auth.set_user_context($1::uuid, $2::text[])', [
      canonicalSeedIds.user,
      ['tenant:user'],
    ]);

    const result = await fixture.client.query<{
      file_id: string;
      tenancy_id: string;
      object_key: string;
      metadata: Record<string, never>;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        insert into storage.files (
          bucket,
          object_key,
          filename,
          mime_type,
          size_bytes,
          checksum
        )
        values (
          'stynx-runtime',
          'tenant-a/generated-from-context.txt',
          'generated-from-context.txt',
          'text/plain',
          42,
          'sha256:tenant-a'
        )
        returning
          file_id::text,
          tenancy_id::text,
          object_key,
          metadata,
          created_at,
          updated_at
      `,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      tenancy_id: tenantA,
      object_key: 'tenant-a/generated-from-context.txt',
      metadata: {},
    });
    expect(result.rows[0]?.file_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(result.rows[0]?.created_at).toBeInstanceOf(Date);
    expect(result.rows[0]?.updated_at).toBeInstanceOf(Date);
  });

  it('fires storage.touch_updated_at on update and leaves explicit insert timestamps untouched', async () => {
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    await fixture.client.query('select auth.set_user_context($1::uuid, $2::text[])', [
      canonicalSeedIds.user,
      ['tenant:user'],
    ]);

    const inserted = await fixture.client.query<{ file_id: string; updated_at: Date }>(
      `
        insert into storage.files (
          tenancy_id,
          bucket,
          object_key,
          filename,
          updated_at
        )
        values (
          $1::uuid,
          'stynx-runtime',
          'tenant-a/explicit-insert-timestamp.txt',
          'explicit-insert-timestamp.txt',
          $2::timestamptz
        )
        returning file_id::text, updated_at
      `,
      [tenantA, explicitInsertedAt],
    );

    expect(inserted.rows[0]?.updated_at.toISOString()).toBe(explicitInsertedAt);

    const updated = await fixture.client.query<{ created_at: Date; updated_at: Date }>(
      `
        update storage.files
           set filename = 'explicit-insert-timestamp-renamed.txt'
         where file_id = $1::uuid
        returning created_at, updated_at
      `,
      [inserted.rows[0]?.file_id],
    );

    expect(updated.rows).toHaveLength(1);
    expect(updated.rows[0]?.updated_at.getTime()).toBeGreaterThan(
      inserted.rows[0]?.updated_at.getTime() ?? 0,
    );
  });

  it('rejects storage file inserts when the provided tenant mismatches auth.current_tenant', async () => {
    await fixture.client.query(`set role ${quoteIdentifier(appRole)}`);
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    await fixture.client.query('select auth.set_user_context($1::uuid, $2::text[])', [
      canonicalSeedIds.user,
      ['tenant:user'],
    ]);

    await expect(
      fixture.client.query(
        `
          insert into storage.files (
            tenancy_id,
            bucket,
            object_key,
            filename
          )
          values (
            $1::uuid,
            'stynx-runtime',
            'tenant-b/rejected-mismatch.txt',
            'rejected-mismatch.txt'
          )
        `,
        [tenantB],
      ),
    ).rejects.toMatchObject({
      code: '42501',
      message: expect.stringContaining(`Tenant mismatch. expected=${tenantA}, provided=${tenantB}`),
    });
  });

  it('applies tenant_scope RLS so a non-owner role sees only the current tenant files', async () => {
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    await fixture.client.query('select auth.set_user_context($1::uuid, $2::text[])', [
      canonicalSeedIds.user,
      ['platform:superadmin'],
    ]);

    await fixture.client.query(
      `
        insert into storage.files (tenancy_id, bucket, object_key, filename)
        values
          ($1::uuid, 'stynx-runtime', 'tenant-a/visible-only-to-a.txt', 'visible-only-to-a.txt'),
          ($2::uuid, 'stynx-runtime', 'tenant-b/visible-only-to-b.txt', 'visible-only-to-b.txt')
      `,
      [tenantA, tenantB],
    );

    await fixture.client.query(`set role ${quoteIdentifier(appRole)}`);
    await fixture.client.query('select auth.set_user_context($1::uuid, $2::text[])', [
      canonicalSeedIds.user,
      ['tenant:user'],
    ]);

    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    const tenantAResult = await fixture.client.query<{ object_key: string }>(
      `
        select object_key
          from storage.files
         order by object_key
      `,
    );

    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantB]);
    const tenantBResult = await fixture.client.query<{ object_key: string }>(
      `
        select object_key
          from storage.files
         order by object_key
      `,
    );

    expect(tenantAResult.rows.map((row) => row.object_key)).toEqual([
      'tenant-a/visible-only-to-a.txt',
    ]);
    expect(tenantBResult.rows.map((row) => row.object_key)).toEqual([
      'tenant-b/visible-only-to-b.txt',
    ]);
  });
});
