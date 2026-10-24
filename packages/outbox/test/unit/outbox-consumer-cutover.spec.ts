import { createFakeTransaction } from '../../../testing/src/fake-transaction.js';
import { auditContractAvailable, setLockTimeout, lockOwnershipMarker, cutoverAuditedRelations } from '../../src/outbox-context.repository.js';
import { readLegacyCutoverRows, finishLegacyOwnership } from '../../src/outbox-commands.repository.js';
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
        [],
      );
      expect(
        query.mock.calls.every(
          ([sql]) => !/legacy_ownership|FOR UPDATE|FROM outbox|UPDATE outbox/iu.test(sql),
        ),
      ).toBe(true);
    },
  );
});

const lockTables = [
  'messages', 'events', 'event_delivery', 'legacy_event_map',
  'event_attempts', 'event_acks', 'tenant_clock', 'legacy_ownership',
];
const lockTexts = lockTables.map((table) => `lock table outbox.${table} in share row exclusive mode`);
const cutoverPrefix = () => [
  { rows: [{ available: true }], rowCount: 1 },
  { rows: [{ set_config: '5000' }], rowCount: 1 },
  { rows: [{ state: 'LEGACY', generation: '1' }], rowCount: 1 },
];
const emptyCutover = () => ({ rows: [], rowCount: 0 });
const prefixCalls = [
  { text: auditContractAvailable.text, values: [] },
  { text: setLockTimeout.text, values: ['5000'] },
  { text: lockOwnershipMarker.text, values: [] },
];

function cutoverDatabase(fake: ReturnType<typeof createFakeTransaction>) {
  return {
    tx: vi.fn(async (work: (trx: typeof fake.transaction) => Promise<unknown>, _options: unknown) => work(fake.transaction)),
    withSystemContext: vi.fn(async (_reason: string, work: () => Promise<unknown>) => work()),
  };
}

describe('eight closed legacy cutover lock statements', () => {
  it('retains exact order, empty binds, owner transaction and post-lock completion', async () => {
    const fake = createFakeTransaction([...cutoverPrefix(), ...lockTables.map(emptyCutover), emptyCutover(), emptyCutover(), emptyCutover()], { role: 'owner' });
    const database = cutoverDatabase(fake);
    const service = new OutboxService(database as never, {});
    await expect(service.cutoverLegacyMessages()).resolves.toEqual({ migrated: 0, generation: 2 });
    expect(fake.queries).toEqual([
      ...prefixCalls,
      ...lockTexts.map((text) => ({ text, values: [] })),
      { text: cutoverAuditedRelations.text, values: [lockTables] },
      { text: readLegacyCutoverRows.text, values: [] },
      { text: finishLegacyOwnership.text, values: [2] },
    ]);
    expect(database.withSystemContext).toHaveBeenCalledExactlyOnceWith('outbox legacy cutover', expect.any(Function));
    expect(database.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { role: 'owner', isolation: 'read committed', retry: false });
    console.log('OUTBOX_LOCK_BASELINE ' + JSON.stringify(fake.queries));
  });

  it.each(lockTables.map((table, index) => ({ table, index })))('stops immediately on $table lock failure', async ({ index }) => {
    const failure = new Error(`lock failure ${index}`);
    const fake = createFakeTransaction([...cutoverPrefix(), ...lockTables.slice(0, index).map(emptyCutover), failure], { role: 'owner' });
    const database = cutoverDatabase(fake);
    const service = new OutboxService(database as never, {});
    await expect(service.cutoverLegacyMessages()).rejects.toBe(failure);
    expect(fake.queries).toEqual([...prefixCalls, ...lockTexts.slice(0, index + 1).map((text) => ({ text, values: [] }))]);
    expect(fake.queries).toHaveLength(index + 4);
    expect(database.tx).toHaveBeenCalledTimes(1);
    expect(database.withSystemContext).toHaveBeenCalledTimes(1);
  });
});
