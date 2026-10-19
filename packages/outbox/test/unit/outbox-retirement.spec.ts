import { OutboxService } from '../../src/outbox.service.js';

const tenantId = 'e1111111-1111-4111-8111-111111111111';
const eventId = 'e2222222-2222-4222-8222-222222222222';

function harness(tenant: string | null = tenantId) {
  const database = {
    appRoleName: 'stynx_app',
    currentTenantId: () => tenant ?? undefined,
    tx: vi.fn(),
    withSystemContext: vi.fn(),
  };
  return { database, service: new OutboxService(database as never, {}) };
}

// INV-TENANCY-001; ADR-OUTBOX-0004 D1: invalid operator input cannot reach SQL,
// and caller-supplied identity cannot replace the trusted request identity.
describe('outbox retirement input boundary', () => {
  it.each([
    [
      'malformed event',
      'not-a-uuid',
      { idempotencyKey: 'retire-1', reason: 'Destination removed' },
    ],
    ['empty key', eventId, { idempotencyKey: '', reason: 'Destination removed' }],
    ['non-string key', eventId, { idempotencyKey: 42, reason: 'Destination removed' }],
    [
      'oversize UTF-8 key',
      eventId,
      { idempotencyKey: 'é'.repeat(128), reason: 'Destination removed' },
    ],
    ['empty reason', eventId, { idempotencyKey: 'retire-1', reason: '' }],
    ['blank reason', eventId, { idempotencyKey: 'retire-1', reason: ' \t\n ' }],
    [
      'non-ASCII blank reason',
      eventId,
      { idempotencyKey: 'retire-1', reason: '\u00a0\u2003\ufeff' },
    ],
    ['non-string reason', eventId, { idempotencyKey: 'retire-1', reason: null }],
    ['oversize UTF-8 reason', eventId, { idempotencyKey: 'retire-1', reason: 'é'.repeat(1025) }],
    [
      'caller tenant',
      eventId,
      { idempotencyKey: 'retire-1', reason: 'Destination removed', tenantId },
    ],
    [
      'caller actor',
      eventId,
      { idempotencyKey: 'retire-1', reason: 'Destination removed', actorId: eventId },
    ],
    [
      'ill-formed Unicode key',
      eventId,
      { idempotencyKey: '\ud800', reason: 'Destination removed' },
    ],
    ['ill-formed Unicode reason', eventId, { idempotencyKey: 'retire-1', reason: '\udfff' }],
    ['NUL key', eventId, { idempotencyKey: 'retire\0key', reason: 'Destination removed' }],
    ['NUL reason', eventId, { idempotencyKey: 'retire-1', reason: 'Destination\0removed' }],
  ])('refuses %s before any transaction', async (_label, identity, input) => {
    const { database, service } = harness();
    await expect(service.retireEvent(identity, input as never)).rejects.toMatchObject({
      code: 'OUTBOX_RETIREMENT_INVALID',
      status: 400,
    });
    expect(database.tx).not.toHaveBeenCalled();
    expect(database.withSystemContext).not.toHaveBeenCalled();
  });

  it('does not read or write without a trusted context tenant', async () => {
    const { database, service } = harness(null);
    await expect(
      service.retireEvent(eventId, { idempotencyKey: 'key', reason: 'Removed' }),
    ).rejects.toMatchObject({
      code: 'OUTBOX_NOT_FOUND',
      context: { reason: 'missing-tenant-context' },
    });
    await expect(service.getEventRetirement(eventId)).rejects.toMatchObject({
      code: 'OUTBOX_NOT_FOUND',
    });
    expect(database.tx).not.toHaveBeenCalled();
    expect(database.withSystemContext).not.toHaveBeenCalled();
  });

  it('does not acquire a connection for a malformed historical receipt identity', async () => {
    const { database, service } = harness();
    await expect(service.getEventRetirement('not-a-uuid')).resolves.toBe(null);
    expect(database.tx).not.toHaveBeenCalled();
    expect(database.withSystemContext).not.toHaveBeenCalled();
  });

  it('normalizes a database operation-key race without exposing the competing receipt', async () => {
    const { database, service } = harness();
    database.tx.mockRejectedValueOnce({ code: '23505', detail: 'private-other-tenant-receipt' });
    const refusal = await service
      .retireEvent(eventId, { idempotencyKey: 'race', reason: 'Removed' })
      .catch((error) => error);
    expect(refusal).toMatchObject({
      code: 'OUTBOX_RETIREMENT_CONFLICT',
      status: 409,
      context: { reason: 'operation-conflict' },
    });
    expect(JSON.stringify(refusal)).not.toContain('private-other-tenant-receipt');
    expect(database.tx).toHaveBeenCalledTimes(1);
    expect(database.tx.mock.calls[0]![1]).toEqual({
      role: 'app',
      requireActor: true,
      retry: false,
    });
  });

  it('refuses an inconsistent already-retired projection without inventing replacement provenance', async () => {
    const { database, service } = harness();
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ status: 'RETIRED', leaseUntil: null, actorId: eventId }] })
      .mockResolvedValueOnce({ rows: [] });
    database.tx.mockImplementationOnce((work) => work({ query }));
    await expect(
      service.retireEvent(eventId, { idempotencyKey: 'missing-receipt', reason: 'Removed' }),
    ).rejects.toMatchObject({
      code: 'OUTBOX_RETIREMENT_CONFLICT',
      status: 409,
      context: { reason: 'already-retired' },
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => !/^\s*(?:INSERT|UPDATE|DELETE)/iu.test(sql))).toBe(
      true,
    );
  });
});
