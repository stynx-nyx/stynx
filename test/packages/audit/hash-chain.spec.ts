import { createHash } from 'node:crypto';
import { StynxAuditService } from '@stynx-nyx/audit';

interface AuditChainRow {
  event_id: string;
  occurred_at_text: string;
  tenancy_id_text: string;
  actor_id_text: string;
  entity: string;
  entity_id: string;
  operation_text: string;
  old_data_text: string | null;
  new_data_text: string | null;
  previous_hash: string | null;
  row_hash: string;
}

function hash(row: Omit<AuditChainRow, 'row_hash'>): string {
  return createHash('sha256')
    .update(
      [
        row.event_id,
        row.occurred_at_text,
        row.tenancy_id_text,
        row.actor_id_text,
        row.entity,
        row.entity_id,
        row.operation_text,
        row.old_data_text ?? '',
        row.new_data_text ?? '',
        row.previous_hash ?? 'GENESIS',
      ].join('|'),
    )
    .digest('hex');
}

function withHash(row: Omit<AuditChainRow, 'row_hash'>): AuditChainRow {
  return {
    ...row,
    row_hash: hash(row),
  };
}

function createService(rows: AuditChainRow[]): StynxAuditService {
  const trx = {
    query: vi.fn(async () => ({ rows })),
  };
  const database = {
    withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
    tx: vi.fn(async (fn: (queryable: typeof trx) => Promise<unknown>) => fn(trx)),
  };
  const moduleRef = {
    get: vi.fn(() => database),
  };
  return new StynxAuditService(
    moduleRef as never,
    {},
    { now: () => new Date('2026-04-26T00:00:00.000Z') },
  );
}

function chainRows(): AuditChainRow[] {
  const base = {
    tenancy_id_text: '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
    actor_id_text: '0197481e-6f84-77e4-8d6d-41f0b6fca9c2',
    entity: 'demo.items',
    entity_id: 'item-1',
  };
  const first = withHash({
    ...base,
    event_id: '0197481e-6f84-77e4-8d6d-41f0b6fca9d1',
    occurred_at_text: '2026-04-26 00:00:00+00',
    operation_text: 'INSERT',
    old_data_text: null,
    new_data_text: '{"label": "one"}',
    previous_hash: null,
  });
  const second = withHash({
    ...base,
    event_id: '0197481e-6f84-77e4-8d6d-41f0b6fca9d2',
    occurred_at_text: '2026-04-26 00:00:01+00',
    operation_text: 'UPDATE',
    old_data_text: '{"label": "one"}',
    new_data_text: '{"label": "two"}',
    previous_hash: first.row_hash,
  });
  const third = withHash({
    ...base,
    event_id: '0197481e-6f84-77e4-8d6d-41f0b6fca9d3',
    occurred_at_text: '2026-04-26 00:00:02+00',
    operation_text: 'UPDATE',
    old_data_text: '{"label": "two"}',
    new_data_text: '{"label": "three"}',
    previous_hash: second.row_hash,
  });
  return [first, second, third];
}

describe('StynxAuditService hash-chain verification', () => {
  it('accepts a valid chain', async () => {
    const service = createService(chainRows());

    await expect(service.verifyChain('0197481e-6f84-77e4-8d6d-41f0b6fca9c1')).resolves.toEqual({
      valid: true,
      totalChecked: 3,
    });
  });

  it('reports the upstream row when a later previous_hash no longer matches it', async () => {
    const [first, second, third] = chainRows();
    const tamperedFirst = withHash({
      ...first,
      old_data_text: '{}',
    });
    const service = createService([tamperedFirst, second, third]);

    await expect(service.verifyChain('0197481e-6f84-77e4-8d6d-41f0b6fca9c1')).resolves.toEqual({
      valid: false,
      totalChecked: 2,
      firstBrokenEventId: first.event_id,
    });
  });
});
