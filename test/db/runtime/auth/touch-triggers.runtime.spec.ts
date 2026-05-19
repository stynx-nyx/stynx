import {
  canonicalSeedIds,
  createDbRuntimeFixture,
  type DbRuntimeFixture,
} from '../fixtures';

const oldTimestamp = '2000-01-01T00:00:00.000Z';

async function resetAuthContext(fixture: DbRuntimeFixture): Promise<void> {
  await fixture.client.query('select auth.set_tenant(null)');
  await fixture.client.query('select auth.set_user_context(null, null, null)');
}

describe('auth touch triggers', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_auth_touch_triggers');
  });

  beforeEach(async () => {
    await resetAuthContext(fixture);
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('updates auth.tenancies.updated_at on UPDATE and leaves it stable on INSERT', async () => {
    const tenancyId = '60000000-0000-0000-0000-000000000001';

    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenancyId]);
    await fixture.client.query(
      `
        insert into auth.tenancies (tenancy_id, code, name, updated_at)
        values ($1::uuid, 'w3-touch-tenancy', 'W3 Touch Tenancy', $2::timestamptz)
      `,
      [tenancyId, oldTimestamp],
    );

    const insertedRow = await fixture.client.query<{ updated_at: Date }>(
      'select updated_at from auth.tenancies where tenancy_id = $1::uuid',
      [tenancyId],
    );
    expect(insertedRow.rows[0]?.updated_at.toISOString()).toBe(oldTimestamp);

    await fixture.client.query(
      `
        update auth.tenancies
        set name = 'W3 Touch Tenancy Updated'
        where tenancy_id = $1::uuid
      `,
      [tenancyId],
    );

    const updatedRow = await fixture.client.query<{ updated_at: Date }>(
      'select updated_at from auth.tenancies where tenancy_id = $1::uuid',
      [tenancyId],
    );
    expect(updatedRow.rows[0]?.updated_at.getTime()).toBeGreaterThan(
      insertedRow.rows[0]?.updated_at.getTime() ?? 0,
    );
  });

  it('updates auth.users.updated_at on UPDATE and leaves it stable on INSERT', async () => {
    const userId = '60000000-0000-0000-0000-000000000101';

    await fixture.client.query('select auth.set_tenant($1::uuid)', [canonicalSeedIds.tenancy]);
    await fixture.client.query(
      `
        insert into auth.users (
          user_id,
          external_id,
          username,
          email,
          display_name,
          status,
          tenancy_id,
          updated_at
        )
        values (
          $1::uuid,
          'w3-touch-user',
          'w3-touch-user@example.com',
          'w3-touch-user@example.com',
          'W3 Touch User',
          'CONFIRMED',
          $2::uuid,
          $3::timestamptz
        )
      `,
      [userId, canonicalSeedIds.tenancy, oldTimestamp],
    );

    const insertedRow = await fixture.client.query<{ updated_at: Date }>(
      'select updated_at from auth.users where user_id = $1::uuid',
      [userId],
    );
    expect(insertedRow.rows[0]?.updated_at.toISOString()).toBe(oldTimestamp);

    await fixture.client.query(
      `
        update auth.users
        set display_name = 'W3 Touch User Updated'
        where user_id = $1::uuid
      `,
      [userId],
    );

    const updatedRow = await fixture.client.query<{ updated_at: Date }>(
      'select updated_at from auth.users where user_id = $1::uuid',
      [userId],
    );
    expect(updatedRow.rows[0]?.updated_at.getTime()).toBeGreaterThan(
      insertedRow.rows[0]?.updated_at.getTime() ?? 0,
    );
  });

  it('updates auth.roles.updated_at on UPDATE and leaves it stable on INSERT', async () => {
    const roleId = '60000000-0000-0000-0000-000000000201';

    await fixture.client.query(
      `
        insert into auth.roles (role_id, code, name, description, updated_at)
        values (
          $1::uuid,
          'w3:touch-role',
          'W3 Touch Role',
          'Inserted by runtime touch trigger test',
          $2::timestamptz
        )
      `,
      [roleId, oldTimestamp],
    );

    const insertedRow = await fixture.client.query<{ updated_at: Date }>(
      'select updated_at from auth.roles where role_id = $1::uuid',
      [roleId],
    );
    expect(insertedRow.rows[0]?.updated_at.toISOString()).toBe(oldTimestamp);

    await fixture.client.query(
      `
        update auth.roles
        set description = 'Updated by runtime touch trigger test'
        where role_id = $1::uuid
      `,
      [roleId],
    );

    const updatedRow = await fixture.client.query<{ updated_at: Date }>(
      'select updated_at from auth.roles where role_id = $1::uuid',
      [roleId],
    );
    expect(updatedRow.rows[0]?.updated_at.getTime()).toBeGreaterThan(
      insertedRow.rows[0]?.updated_at.getTime() ?? 0,
    );
  });

  it('updates auth.tenancy_members.updated_at on UPDATE and leaves it stable on INSERT', async () => {
    const userId = '60000000-0000-0000-0000-000000000301';
    const membershipId = '60000000-0000-0000-0000-000000000302';

    await fixture.client.query('select auth.set_tenant($1::uuid)', [canonicalSeedIds.tenancy]);
    await fixture.client.query(
      `
        insert into auth.users (
          user_id,
          external_id,
          username,
          email,
          display_name,
          status,
          tenancy_id
        )
        values (
          $1::uuid,
          'w3-touch-member-user',
          'w3-touch-member-user@example.com',
          'w3-touch-member-user@example.com',
          'W3 Touch Member User',
          'CONFIRMED',
          $2::uuid
        )
      `,
      [userId, canonicalSeedIds.tenancy],
    );
    await fixture.client.query(
      `
        insert into auth.tenancy_members (
          membership_id,
          tenancy_id,
          user_id,
          default_role,
          created_by,
          updated_at
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::timestamptz)
      `,
      [
        membershipId,
        canonicalSeedIds.tenancy,
        userId,
        canonicalSeedIds.roles.tenantUser,
        canonicalSeedIds.user,
        oldTimestamp,
      ],
    );

    const insertedRow = await fixture.client.query<{ updated_at: Date }>(
      'select updated_at from auth.tenancy_members where membership_id = $1::uuid',
      [membershipId],
    );
    expect(insertedRow.rows[0]?.updated_at.toISOString()).toBe(oldTimestamp);

    await fixture.client.query(
      `
        update auth.tenancy_members
        set invitation_status = 'accepted'
        where membership_id = $1::uuid
      `,
      [membershipId],
    );

    const updatedRow = await fixture.client.query<{ updated_at: Date }>(
      'select updated_at from auth.tenancy_members where membership_id = $1::uuid',
      [membershipId],
    );
    expect(updatedRow.rows[0]?.updated_at.getTime()).toBeGreaterThan(
      insertedRow.rows[0]?.updated_at.getTime() ?? 0,
    );
  });
});
