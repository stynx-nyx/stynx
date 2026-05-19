import { createDbRuntimeFixture, type DbRuntimeFixture } from '../fixtures';

const tenantA = '66666666-6666-6666-6666-666666666666';
const tenantB = '77777777-7777-7777-7777-777777777777';
const actorId = '88888888-8888-8888-8888-888888888888';

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

describe('audit.events tenant_scope RLS runtime behavior', () => {
  let fixture: DbRuntimeFixture;
  let appRole: string;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_audit_scope');
    appRole = `stynx_audit_scope_${fixture.database.database.slice(-8)}`;

    await fixture.client.query(`create role ${quoteIdent(appRole)}`);
    await fixture.client.query(`grant usage on schema auth, audit to ${quoteIdent(appRole)}`);
    await fixture.client.query(`grant execute on all functions in schema auth to ${quoteIdent(appRole)}`);
    await fixture.client.query(`grant execute on all functions in schema audit to ${quoteIdent(appRole)}`);
    await fixture.client.query(`grant select, insert on audit.events to ${quoteIdent(appRole)}`);
  });

  beforeEach(async () => {
    await fixture.client.query('reset role');
    await fixture.client.query('truncate audit.events');
    await fixture.client.query('select auth.set_tenant(null), auth.set_user_context(null, null)');

    await fixture.client.query(
      `
        insert into audit.events (
          event_id,
          occurred_at,
          tenancy_id,
          actor_id,
          operation,
          entity,
          entity_id,
          new_data
        )
        values
          (
            '20000000-0000-0000-0000-000000000001',
            '2026-05-19T11:00:00Z',
            $1::uuid,
            $3::uuid,
            'INSERT',
            'tenant-a.entity',
            'a-1',
            '{"tenant":"a"}'::jsonb
          ),
          (
            '20000000-0000-0000-0000-000000000002',
            '2026-05-19T11:01:00Z',
            $2::uuid,
            $3::uuid,
            'INSERT',
            'tenant-b.entity',
            'b-1',
            '{"tenant":"b"}'::jsonb
          ),
          (
            '20000000-0000-0000-0000-000000000003',
            '2026-05-19T11:02:00Z',
            null,
            $3::uuid,
            'SYSTEM',
            'system.entity',
            'system-1',
            '{"system":true}'::jsonb
          )
      `,
      [tenantA, tenantB, actorId],
    );
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.client.query('reset role').catch(() => undefined);
      await fixture.client.query(`drop role if exists ${quoteIdent(appRole)}`).catch(() => undefined);
      await fixture.dispose();
    }
  });

  it('limits non-owner reads to auth.current_tenant plus tenantless audit events', async () => {
    await fixture.client.query(`set role ${quoteIdent(appRole)}`);
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    await fixture.client.query('select auth.set_user_context($1::uuid, array[]::text[])', [actorId]);

    const tenantAEvents = await fixture.client.query<{ entity: string }>(
      `
        select entity
        from audit.events
        order by occurred_at, event_id
      `,
    );
    expect(tenantAEvents.rows.map((row) => row.entity)).toEqual(['tenant-a.entity', 'system.entity']);

    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantB]);
    const tenantBEvents = await fixture.client.query<{ entity: string }>(
      `
        select entity
        from audit.events
        order by occurred_at, event_id
      `,
    );
    expect(tenantBEvents.rows.map((row) => row.entity)).toEqual(['tenant-b.entity', 'system.entity']);
  });

  it('allows platform:superadmin context to read all tenant-scoped audit events', async () => {
    await fixture.client.query(`set role ${quoteIdent(appRole)}`);
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    await fixture.client.query(`select auth.set_user_context($1::uuid, array['platform:superadmin'])`, [actorId]);

    const events = await fixture.client.query<{ entity: string }>(
      `
        select entity
        from audit.events
        order by occurred_at, event_id
      `,
    );
    expect(events.rows.map((row) => row.entity)).toEqual([
      'tenant-a.entity',
      'tenant-b.entity',
      'system.entity',
    ]);
  });

  it('rejects inserts for another tenant under the non-owner application role', async () => {
    await fixture.client.query(`set role ${quoteIdent(appRole)}`);
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantA]);
    await fixture.client.query('select auth.set_user_context($1::uuid, array[]::text[])', [actorId]);

    await expect(
      fixture.client.query(
        `
          insert into audit.events (
            event_id,
            occurred_at,
            tenancy_id,
            actor_id,
            operation,
            entity,
            entity_id,
            new_data
          )
          values (
            '20000000-0000-0000-0000-000000000004',
            '2026-05-19T11:03:00Z',
            $1::uuid,
            $2::uuid,
            'INSERT',
            'tenant-b.entity',
            'b-denied',
            '{"tenant":"b"}'::jsonb
          )
        `,
        [tenantB, actorId],
      ),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });
});
