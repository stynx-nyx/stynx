import { OutboxService } from '../../src/outbox.service.js';

// ADR-OUTBOX-0003 D2/D3 and ADR-OUTBOX-0004 D4: consumer-owned storage never
// invokes platform legacy transfer or mutates a marker before audit readiness.
describe('consumer storage legacy-cutover boundary', () => {
  it('refuses explicit consumer-owned mode before acquiring any connection', async () => {
    const database = { appRoleName: 'role_app_backend', tx: vi.fn(), withSystemContext: vi.fn() };
    const service = new OutboxService(database as never, { storageMode: 'consumer-owned' });
    await expect(service.cutoverLegacyMessages()).rejects.toMatchObject({
      code: 'OUTBOX_CONSUMER_STORAGE_CUTOVER_UNSUPPORTED',
      status: 409,
      reason: 'consumer-owned-storage',
    });
    expect(database.tx).not.toHaveBeenCalled();
    expect(database.withSystemContext).not.toHaveBeenCalled();
  });

  it.each([undefined, 'platform'] as const)(
    'checks audit availability before any domain lookup or marker lock (mode=%s)',
    async (mode) => {
      const query = vi.fn(async (_sql: string) => ({ rows: [{ available: false }] }));
      const tx = vi.fn(async (work: (trx: unknown) => Promise<unknown>) =>
        work({ query, role: 'owner' }),
      );
      const database = {
        appRoleName: 'role_app_backend',
        tx,
        withSystemContext: vi.fn(async (_reason: string, work: () => Promise<unknown>) => work()),
      };
      const service = new OutboxService(database as never, mode ? { storageMode: mode } : {});
      await expect(service.cutoverLegacyMessages()).rejects.toMatchObject({
        code: 'OUTBOX_CONSUMER_STORAGE_CUTOVER_UNSUPPORTED',
        status: 409,
        reason: 'audit-chain-unavailable',
      });
      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith(
        "select to_regprocedure('audit.fn_row_change()') is not null as available",
      );
      expect(
        query.mock.calls.every(
          ([sql]) => !/legacy_ownership|FOR UPDATE|FROM outbox|UPDATE outbox/iu.test(sql),
        ),
      ).toBe(true);
    },
  );
});
