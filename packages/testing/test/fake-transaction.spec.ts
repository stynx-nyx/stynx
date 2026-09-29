import { sql } from 'drizzle-orm';
import { Transaction, tenants } from '@stynx-nyx/data';
import { createFakeTransaction } from '@stynx-nyx/testing';

describe('createFakeTransaction', () => {
  it('exposes an actual Transaction and scripts direct and Drizzle SQL queries in order', async () => {
    const fake = createFakeTransaction(
      [
        { rows: [{ answer: 7 }], rowCount: 1 },
        { rows: [{ id: 'row-1' }], rowCount: 1 },
      ],
      { role: 'app' },
    );
    const transaction: Transaction = fake.transaction;

    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction.role).toBe('app');
    await expect(transaction.execute(sql`select ${7}::int as answer`)).resolves.toMatchObject({
      rows: [{ answer: 7 }],
      rowCount: 1,
    });
    await expect(
      transaction.query<{ id: string }>('select id from items where id = $1', ['row-1']),
    ).resolves.toMatchObject({ rows: [{ id: 'row-1' }], rowCount: 1 });

    expect(fake.queries).toEqual([
      { text: 'select $1::int as answer', values: [7] },
      { text: 'select id from items where id = $1', values: ['row-1'] },
    ]);
  });

  it('propagates scripted errors, records the attempted SQL, and accepts later responses', async () => {
    const failure = new Error('scripted database failure');
    const fake = createFakeTransaction([failure], { role: 'owner' });

    await expect(fake.transaction.query('select failing')).rejects.toBe(failure);
    expect(fake.queries).toEqual([expect.objectContaining({ text: 'select failing', values: [] })]);

    fake.enqueue({ rows: [{ ok: true }], rowCount: 1 });
    await expect(fake.transaction.execute(sql`select true as ok`)).resolves.toMatchObject({
      rows: [{ ok: true }],
      rowCount: 1,
    });
    expect(fake.queries).toHaveLength(2);
  });

  it('preserves reader role guards and Transaction close semantics', async () => {
    const fake = createFakeTransaction([], { role: 'reader' });

    await expect(
      fake.transaction.hardDeleteFromArchive(1n, {
        archiveTable: 'archive.items',
        confirm: 'I understand this is irrecoverable',
      }),
    ).rejects.toMatchObject({ context: { role: 'reader' } });
    expect(fake.queries).toEqual([]);

    fake.transaction.close();
    await expect(fake.transaction.query('select 1')).rejects.toMatchObject({
      code: 'TRANSACTION_REQUIRED',
    });
    await expect(fake.transaction.execute(sql`select 1`)).rejects.toMatchObject({
      code: 'TRANSACTION_REQUIRED',
    });
    expect(fake.queries).toEqual([]);
  });

  it('fails on an unscripted query and records the attempted SQL', async () => {
    const fake = createFakeTransaction([], { role: 'app' });

    await expect(fake.transaction.query('select missing')).rejects.toThrow(
      'No fake transaction response queued for: select missing',
    );
    expect(fake.queries).toEqual([{ text: 'select missing', values: [] }]);
  });

  it('maps both object and array rows from the pg array mode used by Drizzle', async () => {
    const fake = createFakeTransaction(
      [
        { rows: [{ id: 'tenant-object' }], rowCount: 1 },
        { rows: [['tenant-array']], rowCount: 1 },
      ],
      { role: 'app' },
    );

    await expect(fake.transaction.select().from(tenants)).resolves.toMatchObject([
      { id: 'tenant-object' },
    ]);
    await expect(fake.transaction.select().from(tenants)).resolves.toMatchObject([
      { id: 'tenant-array' },
    ]);
    expect(fake.queries).toEqual([
      expect.objectContaining({ rowMode: 'array' }),
      expect.objectContaining({ rowMode: 'array' }),
    ]);
  });
});
