import { createHash } from 'node:crypto';
import { ModuleRef } from '@nestjs/core';
import { StynxAuditService } from '../../src/audit.service';

interface TestAuditChainRow {
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

function hashRow(row: Omit<TestAuditChainRow, 'row_hash'>): string {
  return createHash('sha256').update([
    row.event_id,
    row.occurred_at_text ?? '',
    row.tenancy_id_text ?? '',
    row.actor_id_text ?? '',
    row.entity ?? '',
    row.entity_id ?? '',
    row.operation_text ?? '',
    row.old_data_text ?? '',
    row.new_data_text ?? '',
    row.previous_hash ?? 'GENESIS',
  ].join('|')).digest('hex');
}

function buildRows(): TestAuditChainRow[] {
  const base = {
    tenancy_id_text: '01990000-0000-7000-8000-000000000001',
    actor_id_text: '01990000-0000-7000-8000-000000000002',
    entity: 'demo.items',
    entity_id: '01990000-0000-7000-8000-000000000003',
  };
  const firstWithoutHash = {
    ...base,
    event_id: '01990000-0000-7000-8000-000000000101',
    occurred_at_text: '2026-04-27T00:00:00.000000Z',
    operation_text: 'INSERT',
    old_data_text: null,
    new_data_text: '{"label":"one"}',
    previous_hash: null,
  };
  const firstHash = hashRow(firstWithoutHash);
  const secondWithoutHash = {
    ...base,
    event_id: '01990000-0000-7000-8000-000000000102',
    occurred_at_text: '2026-04-27T00:00:01.000000Z',
    operation_text: 'UPDATE',
    old_data_text: '{"label":"one"}',
    new_data_text: '{"label":"two"}',
    previous_hash: firstHash,
  };
  return [
    { ...firstWithoutHash, row_hash: firstHash },
    { ...secondWithoutHash, row_hash: hashRow(secondWithoutHash) },
  ];
}

function createService(rows: TestAuditChainRow[]): StynxAuditService {
  const database = {
    withSystemContext: jest.fn((_reason: string, fn: () => unknown) => fn()),
    tx: jest.fn((fn: (trx: { query: jest.Mock }) => unknown) =>
      fn({
        query: jest.fn(async () => ({ rows })),
      }),
    ),
  };
  const moduleRef = {
    get: jest.fn(() => database),
  } as unknown as ModuleRef;
  return new StynxAuditService(
    moduleRef,
    { keyPrefix: 'audit' },
    { now: () => new Date('2026-04-27T00:00:00.000Z') },
  );
}

describe('StynxAuditService hash-chain verification', () => {
  it('accepts sequential audit rows and rejects tampered payloads', async () => {
    const rows = buildRows();

    await expect(createService(rows).verifyChain(rows[0]!.tenancy_id_text)).resolves.toEqual({
      valid: true,
      totalChecked: 2,
    });

    const tampered = rows.map((row) => ({ ...row }));
    tampered[1]!.new_data_text = '{"label":"tampered"}';

    await expect(createService(tampered).verifyChain(rows[0]!.tenancy_id_text)).resolves.toEqual({
      valid: false,
      totalChecked: 2,
      firstBrokenEventId: tampered[1]!.event_id,
    });
  });
});
