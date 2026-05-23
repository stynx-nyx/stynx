import { createDbRuntimeFixture, type DbRuntimeFixture } from '../fixtures';

const tenantId = '33333333-3333-3333-3333-333333333333';
const actorId = '44444444-4444-4444-4444-444444444444';
const itemId = '55555555-5555-5555-5555-555555555555';

describe('audit DML trigger runtime behavior', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_audit_dml');
    await fixture.client.query('create schema scratch');
    await fixture.client.query(
      `
        create table scratch.audit_items (
          id uuid primary key,
          tenancy_id uuid not null,
          label text not null,
          amount integer not null default 0
        )
      `,
    );
    await fixture.client.query(
      `
        create table scratch.no_primary_key (
          label text not null
        )
      `,
    );
    await fixture.client.query(`select audit.attach_dml_triggers('scratch', 'audit_items')`);
  });

  beforeEach(async () => {
    await fixture.client.query('truncate scratch.audit_items, scratch.no_primary_key, audit.events');
    await fixture.client.query('select auth.set_tenant(null), auth.set_user_context(null, null)');
    await fixture.client.query(`select set_config('stynx.correlation_id', '', false)`);
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('extract_primary_key returns ordered primary-key JSON and null for unsupported rows', async () => {
    const primaryKey = await fixture.client.query<{ pk: Record<string, unknown> }>(
      `
        select audit.extract_primary_key(
          'scratch',
          'audit_items',
          '{"id":"55555555-5555-5555-5555-555555555555","label":"alpha"}'::jsonb
        ) as pk
      `,
    );
    expect(primaryKey.rows[0]?.pk).toEqual({ id: itemId });

    const noPrimaryKey = await fixture.client.query<{ pk: Record<string, unknown> | null }>(
      `
        select audit.extract_primary_key(
          'scratch',
          'no_primary_key',
          '{"label":"alpha"}'::jsonb
        ) as pk
      `,
    );
    expect(noPrimaryKey.rows[0]?.pk).toBe(null);

    const nullRow = await fixture.client.query<{ pk: Record<string, unknown> | null }>(
      `select audit.extract_primary_key('scratch', 'audit_items', null) as pk`,
    );
    expect(nullRow.rows[0]?.pk).toBe(null);
  });

  it('fn_log_dml records INSERT, UPDATE, and DELETE through audit.attach_dml_triggers', async () => {
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantId]);
    await fixture.client.query(`select auth.set_user_context($1::uuid, array['tenant:admin'])`, [actorId]);
    await fixture.client.query(`select set_config('stynx.correlation_id', 'request-dml-1', false)`);

    await fixture.client.query(
      `
        insert into scratch.audit_items (id, tenancy_id, label, amount)
        values ($1::uuid, $2::uuid, 'alpha', 10)
      `,
      [itemId, tenantId],
    );
    await fixture.client.query(
      `
        update scratch.audit_items
        set label = 'beta',
            amount = 20
        where id = $1::uuid
      `,
      [itemId],
    );
    await fixture.client.query('delete from scratch.audit_items where id = $1::uuid', [itemId]);

    const rows = await fixture.client.query<{
      operation: string;
      entity: string;
      entity_id: string | null;
      pk: Record<string, unknown>;
      request_id: string | null;
      metadata: Record<string, unknown>;
      old_data: Record<string, unknown> | null;
      new_data: Record<string, unknown> | null;
      previous_hash: string | null;
      row_hash: string;
    }>(
      `
        select
          operation,
          entity,
          entity_id,
          pk,
          request_id,
          metadata,
          old_data,
          new_data,
          previous_hash,
          row_hash
        from audit.events
        order by occurred_at, event_id
      `,
    );

    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.map((row) => row.operation)).toEqual(['INSERT', 'UPDATE', 'DELETE']);
    expect(rows.rows.map((row) => row.entity)).toEqual([
      'scratch.audit_items',
      'scratch.audit_items',
      'scratch.audit_items',
    ]);
    expect(rows.rows.map((row) => row.entity_id)).toEqual([itemId, itemId, itemId]);
    expect(rows.rows.map((row) => row.pk)).toEqual([{ id: itemId }, { id: itemId }, { id: itemId }]);
    expect(rows.rows.map((row) => row.request_id)).toEqual([
      'request-dml-1',
      'request-dml-1',
      'request-dml-1',
    ]);

    expect(rows.rows[0]?.old_data).toBe(null);
    expect(rows.rows[0]?.new_data).toMatchObject({ id: itemId, tenancy_id: tenantId, label: 'alpha', amount: 10 });
    expect(rows.rows[0]?.metadata).toMatchObject({ id: itemId, tenancy_id: tenantId, label: 'alpha', amount: 10 });

    expect(rows.rows[1]?.old_data).toMatchObject({ label: 'alpha', amount: 10 });
    expect(rows.rows[1]?.new_data).toMatchObject({ label: 'beta', amount: 20 });
    expect(rows.rows[1]?.metadata).toMatchObject({ label: 'beta', amount: 20 });

    expect(rows.rows[2]?.old_data).toMatchObject({ label: 'beta', amount: 20 });
    expect(rows.rows[2]?.new_data).toBe(null);
    expect(rows.rows[2]?.metadata).toEqual({});

    expect(rows.rows[0]?.previous_hash).toBe(null);
    expect(rows.rows[1]?.previous_hash).toBe(rows.rows[0]?.row_hash);
    expect(rows.rows[2]?.previous_hash).toBe(rows.rows[1]?.row_hash);
  });

  it('audit.attach_dml_triggers replaces an existing audit trigger without duplicating events', async () => {
    await fixture.client.query(`select audit.attach_dml_triggers('scratch', 'audit_items')`);
    await fixture.client.query(`select audit.attach_dml_triggers('scratch', 'audit_items')`);
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantId]);

    await fixture.client.query(
      `
        insert into scratch.audit_items (id, tenancy_id, label, amount)
        values ($1::uuid, $2::uuid, 'single', 1)
      `,
      [itemId, tenantId],
    );

    const eventCount = await fixture.client.query<{ count: string }>('select count(*) from audit.events');
    expect(Number(eventCount.rows[0]?.count)).toBe(1);
  });
});
