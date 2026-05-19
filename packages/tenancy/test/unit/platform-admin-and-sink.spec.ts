import { ForbiddenException } from '@nestjs/common';
import { Database } from '@stynx/data';
import { TenancyPlatformAdminGuard } from '../../src/tenancy-platform-admin.guard';
import {
  TENANT_SYSTEM_OPERATION_SINK_PROVIDER,
  TenantSystemOperationSink,
} from '../../src/tenant-system-operation.sink';

describe('TenancyPlatformAdminGuard', () => {
  const original = process.env.STYNX_TENANCY_PLATFORM_ADMIN;

  afterEach(() => {
    process.env.STYNX_TENANCY_PLATFORM_ADMIN = original;
  });

  it('allows only when the platform admin flag is enabled', () => {
    process.env.STYNX_TENANCY_PLATFORM_ADMIN = 'true';
    expect(new TenancyPlatformAdminGuard().canActivate()).toBe(true);

    process.env.STYNX_TENANCY_PLATFORM_ADMIN = 'false';
    expect(() => new TenancyPlatformAdminGuard().canActivate()).toThrow(ForbiddenException);
  });
});

describe('TenantSystemOperationSink', () => {
  function sinkWithDatabase(database: unknown) {
    return new TenantSystemOperationSink({
      get: vi.fn((token: unknown) => token === Database ? database : undefined),
    } as never);
  }

  it('skips tenant membership validation records', async () => {
    const database = { tx: vi.fn() };
    const sink = sinkWithDatabase(database);

    await sink.write({
      reason: 'tenant membership validation',
      requestId: 'req-1',
      occurredAt: '2026-05-18T12:00:00.000Z',
    });

    expect(database.tx).not.toHaveBeenCalled();
  });

  it('persists system operation records and exposes the provider binding', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const database = {
      tx: vi.fn(async (callback: (trx: { query: typeof query }) => Promise<unknown>, options: unknown) => {
        expect(options).toEqual({ role: 'owner' });
        return callback({ query });
      }),
    };
    const sink = sinkWithDatabase(database);

    await sink.write({
      reason: 'tenant archive export',
      actorId: '018f53e4-28a1-7cd8-a0ff-5b22c3a07112',
      requestId: 'req-1',
      occurredAt: '2026-05-18T12:00:00.000Z',
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('insert into audit.system_op'), [
      '2026-05-18T12:00:00.000Z',
      'tenant archive export',
      '018f53e4-28a1-7cd8-a0ff-5b22c3a07112',
      'req-1',
      JSON.stringify({ source: '@stynx/tenancy' }),
    ]);
    expect(TENANT_SYSTEM_OPERATION_SINK_PROVIDER.useClass).toBe(TenantSystemOperationSink);
  });

  it('persists system operation records without an actor id', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const database = {
      tx: vi.fn(async (callback: (trx: { query: typeof query }) => Promise<unknown>) => callback({ query })),
    };
    const sink = sinkWithDatabase(database);

    await sink.write({
      reason: 'tenant purge',
      requestId: 'req-1',
      occurredAt: '2026-05-18T12:00:00.000Z',
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('insert into audit.system_op'), [
      '2026-05-18T12:00:00.000Z',
      'tenant purge',
      null,
      'req-1',
      JSON.stringify({ source: '@stynx/tenancy' }),
    ]);
  });

  it('fails explicitly when no database provider is available', async () => {
    const sink = sinkWithDatabase(undefined);

    await expect(sink.write({
      reason: 'tenant archive export',
      requestId: 'req-1',
      occurredAt: '2026-05-18T12:00:00.000Z',
    })).rejects.toThrow('Database provider is unavailable to TenantSystemOperationSink');
  });
});
