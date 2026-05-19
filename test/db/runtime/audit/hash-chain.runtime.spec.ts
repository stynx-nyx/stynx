import { createDbRuntimeFixture, type DbRuntimeFixture } from '../fixtures';

const tenantId = '11111111-1111-1111-1111-111111111111';
const actorId = '22222222-2222-2222-2222-222222222222';

const anchorEvents = [
  {
    eventId: '10000000-0000-0000-0000-000000000001',
    occurredAt: '2026-05-19T10:00:00.000000Z',
    entity: 'orders',
    entityId: 'ord-001',
    operation: 'INSERT',
    oldData: null,
    newData: { status: 'draft', total: 1250 },
    rowHash: 'd07e949a1b3763177db2179f55a3cd1a7bf42e2e600821f89ed54dc94a82e38a',
  },
  {
    eventId: '10000000-0000-0000-0000-000000000002',
    occurredAt: '2026-05-19T10:01:00.123456Z',
    entity: 'orders',
    entityId: 'ord-001',
    operation: 'UPDATE',
    oldData: { status: 'draft', total: 1250 },
    newData: { status: 'approved', total: 1250 },
    rowHash: '3e36c1bfc5227fbb892b4140fd4ebf37db8d1d5d437714a472bd5af0063b72db',
  },
  {
    eventId: '10000000-0000-0000-0000-000000000003',
    occurredAt: '2026-05-19T10:02:00.000001Z',
    entity: 'payments',
    entityId: 'pay-001',
    operation: 'INSERT',
    oldData: null,
    newData: { method: 'pix', amount: 1250 },
    rowHash: '4f908fffa20182e25eb9a7a2c2e23be275dd0fd3afb4c1ba6f268ff6408fd0d6',
  },
  {
    eventId: '10000000-0000-0000-0000-000000000004',
    occurredAt: '2026-05-19T10:03:00.999999Z',
    entity: 'orders',
    entityId: 'ord-002',
    operation: 'INSERT',
    oldData: null,
    newData: { status: 'draft', total: 890 },
    rowHash: '9451cc0bfceb14c1418ebcc60aba084ce65b0fcac70ae43ccb89d15ed526418b',
  },
  {
    eventId: '10000000-0000-0000-0000-000000000005',
    occurredAt: '2026-05-19T10:04:00.500000Z',
    entity: 'orders',
    entityId: 'ord-001',
    operation: 'DELETE',
    oldData: { status: 'approved', total: 1250 },
    newData: null,
    rowHash: '638bd02568a77a0539bd1209b7c2ac4653af10e79314f5f72c1d65664ca38ca8',
  },
] as const;

async function insertAnchorEvents(fixture: DbRuntimeFixture): Promise<void> {
  let previousHash: string | null = null;

  for (const event of anchorEvents) {
    await fixture.client.query(
      `
        insert into audit.events (
          event_id,
          occurred_at,
          tenancy_id,
          actor_id,
          entity,
          entity_id,
          operation,
          old_data,
          new_data,
          previous_hash
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
      `,
      [
        event.eventId,
        event.occurredAt,
        tenantId,
        actorId,
        event.entity,
        event.entityId,
        event.operation,
        event.oldData === null ? null : JSON.stringify(event.oldData),
        event.newData === null ? null : JSON.stringify(event.newData),
        previousHash,
      ],
    );
    previousHash = event.rowHash;
  }
}

describe('audit hash-chain runtime behavior', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_audit_hash');
  });

  beforeEach(async () => {
    await fixture.client.query('truncate audit.events');
    await fixture.client.query('select auth.set_tenant(null), auth.set_user_context(null, null)');
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('formats timestamps, computes hashes, and sets pinned row hashes on insert', async () => {
    const formatted = await fixture.client.query<{ formatted: string }>(
      `select audit.format_hash_timestamp($1::timestamptz) as formatted`,
      ['2026-05-19T10:01:00.123456Z'],
    );
    expect(formatted.rows[0]?.formatted).toBe('2026-05-19 10:01:00.123456+00');

    const directHash = await fixture.client.query<{ row_hash: string }>(
      `
        select audit.compute_event_hash(
          $1::uuid,
          $2::timestamptz,
          $3::uuid,
          $4::uuid,
          $5,
          $6,
          $7,
          $8::jsonb,
          $9::jsonb,
          $10
        ) as row_hash
      `,
      [
        anchorEvents[0].eventId,
        anchorEvents[0].occurredAt,
        tenantId,
        actorId,
        anchorEvents[0].entity,
        anchorEvents[0].entityId,
        anchorEvents[0].operation,
        null,
        JSON.stringify(anchorEvents[0].newData),
        null,
      ],
    );
    expect(directHash.rows[0]?.row_hash).toBe(anchorEvents[0].rowHash);

    await insertAnchorEvents(fixture);

    const rows = await fixture.client.query<{ event_id: string; previous_hash: string | null; row_hash: string }>(
      `
        select event_id::text, previous_hash, row_hash
        from audit.events
        order by occurred_at, event_id
      `,
    );

    expect(rows.rows.map((row) => row.row_hash)).toEqual(anchorEvents.map((event) => event.rowHash));
    expect(rows.rows.map((row) => row.previous_hash)).toEqual([
      null,
      anchorEvents[0].rowHash,
      anchorEvents[1].rowHash,
      anchorEvents[2].rowHash,
      anchorEvents[3].rowHash,
    ]);
  });

  it('audit.write appends tenant-local hashes and uses auth.current_tenant when tenant is omitted', async () => {
    await fixture.client.query('select auth.set_tenant($1::uuid)', [tenantId]);
    await fixture.client.query(`select auth.set_user_context($1::uuid, array['tenant:admin'])`, [actorId]);

    await fixture.client.query(
      `
        select audit.write(
          null,
          $1::uuid,
          'tenant:admin',
          'CREATE',
          'case',
          'case-001',
          '{"source":"api"}'::jsonb,
          '127.0.0.1',
          'station-a',
          'request-a',
          null,
          '{"state":"open"}'::jsonb,
          '{"id":"case-001"}'::jsonb
        )
      `,
      [actorId],
    );
    await fixture.client.query(
      `
        select audit.write(
          $1::uuid,
          $2::uuid,
          'tenant:admin',
          'UPDATE',
          'case',
          'case-001',
          '{"source":"worker"}'::jsonb,
          null,
          null,
          'request-b',
          '{"state":"open"}'::jsonb,
          '{"state":"closed"}'::jsonb,
          '{"id":"case-001"}'::jsonb
        )
      `,
      [tenantId, actorId],
    );

    const rows = await fixture.client.query<{
      tenancy_id: string;
      actor_id: string;
      operation: string;
      entity: string;
      entity_id: string;
      metadata: Record<string, unknown>;
      request_id: string | null;
      pk: Record<string, unknown>;
      previous_hash: string | null;
      row_hash: string;
    }>(
      `
        select
          tenancy_id::text,
          actor_id::text,
          operation,
          entity,
          entity_id,
          metadata,
          request_id,
          pk,
          previous_hash,
          row_hash
        from audit.events
        order by occurred_at, event_id
      `,
    );

    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({
      tenancy_id: tenantId,
      actor_id: actorId,
      operation: 'CREATE',
      entity: 'case',
      entity_id: 'case-001',
      metadata: { source: 'api' },
      request_id: 'request-a',
      pk: { id: 'case-001' },
      previous_hash: null,
    });
    expect(rows.rows[1]).toMatchObject({
      operation: 'UPDATE',
      metadata: { source: 'worker' },
      request_id: 'request-b',
      previous_hash: rows.rows[0]?.row_hash,
    });
  });

  it('verify_chain accepts the pinned chain and reports payload tampering', async () => {
    await insertAnchorEvents(fixture);

    const valid = await fixture.client.query<{ event_id: string; chain_valid: boolean }>(
      `
        select event_id::text, chain_valid
        from audit.verify_chain($1::uuid, 10)
        order by occurred_at, event_id
      `,
      [tenantId],
    );
    expect(valid.rows).toHaveLength(anchorEvents.length);
    expect(valid.rows.every((row) => row.chain_valid)).toBe(true);

    await fixture.client.query(
      `
        update audit.events
        set new_data = new_data || '{"tampered": true}'::jsonb
        where event_id = $1::uuid
      `,
      [anchorEvents[1].eventId],
    );

    const tampered = await fixture.client.query<{ event_id: string; chain_valid: boolean }>(
      `
        select event_id::text, chain_valid
        from audit.verify_chain($1::uuid, 10)
        where not chain_valid
        order by occurred_at, event_id
      `,
      [tenantId],
    );
    expect(tampered.rows).toEqual([{ event_id: anchorEvents[1].eventId, chain_valid: false }]);
  });
});
