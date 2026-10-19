import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@stynx-nyx/data';
import {
  pgReplayDurableReservation,
  pgReserveDurableNumbering,
  pgCancelDurableReservation,
} from '../../src/postgres-reservations.js';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store.js';
import type { CTG9ReserveNumberingInput } from '../../src/types.js';
const scope = { tenantId: '00000000-0000-4000-8000-0000000000d4', actorId: 'actor' };
const now = '2026-10-10T12:00:00.000Z';
const until = '2026-10-11T12:00:00.000Z';
const input: CTG9ReserveNumberingInput = {
  orgUnitId: 'org',
  entityType: 'citation',
  deviceId: 'device',
  shiftId: null,
  requestedSize: 1,
};
function database(query: ReturnType<typeof vi.fn>) {
  const tx = vi.fn(async (run: (trx: { query: typeof query }) => Promise<unknown>) =>
    run({ query }),
  );
  return { value: { tx } as unknown as Database, tx };
}
const range = {
  id: 'range',
  tenant_id: scope.tenantId,
  org_unit_id: 'org',
  entity_type: 'citation',
  series: 'A',
  start_number: '1',
  end_number: '9',
  next_number: '1',
  status: 'active',
};

describe('PostgreSQL durable reservation refusal boundary', () => {
  it.each(['42703', '42P01', 'STY44', '08006'])(
    'maps only known schema/admission SQLSTATE %s without exposing raw database messages',
    async (code) => {
      const raw = Object.assign(new Error('private PostgreSQL diagnostic'), { code });
      const { value, tx } = database(
        vi.fn(async () => {
          throw raw;
        }),
      );
      const call = pgReserveDurableNumbering(value, scope, input, now, until);
      if (code === '42703' || code === '42P01')
        await expect(call).rejects.toMatchObject({
          code: 'OFFLINE_SYNC_UPGRADE_REQUIRED',
          message: 'Offline-sync migration 0006 is required.',
        });
      else if (code === 'STY44')
        await expect(call).rejects.toMatchObject({
          code: 'OFFLINE_SYNC_ACTIVE_RESERVATION',
          message: 'An active numbering reservation already exists for this device and shift.',
        });
      else await expect(call).rejects.toBe(raw);
      expect(tx).toHaveBeenCalledWith(expect.any(Function), {
        isolation: 'read committed',
        requireActor: true,
        retry: false,
      });
    },
  );

  it('does not create a transaction for keyless replay and refuses a conflicting live owner before locking a range', async () => {
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes('select id from offline.numbering_reservations') ? [{ id: 'owner' }] : [],
    }));
    const { value, tx } = database(query);
    expect(await pgReplayDurableReservation(value, scope, input)).toBe(null);
    expect(tx).not.toHaveBeenCalled();
    await expect(pgReserveDurableNumbering(value, scope, input, now, until)).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_ACTIVE_RESERVATION',
    });
    expect(query.mock.calls.some(([sql]) => sql.includes('from offline.numbering_ranges'))).toBe(
      false,
    );
  });

  it.each([
    [undefined, 'OFFLINE_SYNC_RANGE_NOT_FOUND'],
    [{ ...range, status: 'cancelled' }, 'OFFLINE_SYNC_RANGE_UNAVAILABLE'],
    [{ ...range, org_unit_id: 'other' }, 'OFFLINE_SYNC_RANGE_UNAVAILABLE'],
    [{ ...range, entity_type: 'other' }, 'OFFLINE_SYNC_RANGE_UNAVAILABLE'],
    [{ ...range, next_number: '10' }, 'OFFLINE_SYNC_RANGE_UNAVAILABLE'],
  ])(
    'refuses missing, mismatched or exhausted ranges without allocating: %j',
    async (row, code) => {
      const query = vi.fn(async (sql: string) => ({
        rows: sql.includes('from offline.numbering_ranges') && row ? [row] : [],
      }));
      const { value } = database(query);
      await expect(
        pgReserveDurableNumbering(value, scope, input, now, until),
      ).rejects.toMatchObject({ code });
      expect(
        query.mock.calls.some(([sql]) =>
          /update offline.numbering_ranges|insert into offline.numbering_reservations/u.test(sql),
        ),
      ).toBe(false);
    },
  );

  it('refuses missing or terminal cancellation before changing any row', async () => {
    for (const rows of [[], [{ id: 'id', status: 'blocked' }]]) {
      const query = vi.fn(async () => ({ rows }));
      const { value } = database(query);
      await expect(pgCancelDurableReservation(value, scope, 'id', {}, now)).rejects.toMatchObject({
        code: rows.length ? 'OFFLINE_SYNC_RESERVATION_STATE' : 'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
      });
      expect(query).toHaveBeenCalledOnce();
    }
  });

  it('translates database enforced active admission on E6 and CTG9 lifecycle paths with unchanged409 semantics', async () => {
    const raw = Object.assign(new Error('internal trigger detail'), { code: 'STY44' });
    const { value } = database(
      vi.fn(async () => {
        throw raw;
      }),
    );
    const store = new PostgresOfflineSyncStore({ get: () => value } as never);
    await expect(
      store.reserveNumbering(scope, { ...input, shiftId: 'shift' }, now, until),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_ACTIVE_RESERVATION' });
    await expect(store.blockNumberingReservation(scope, 'id', {}, now)).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_ACTIVE_RESERVATION',
    });
  });
});
