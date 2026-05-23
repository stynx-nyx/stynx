import { StynxAuditModule } from '../../src/audit.module';
import {
  STYNX_AUDIT_ARCHIVE_STORE,
  STYNX_AUDIT_CLOCK,
  STYNX_AUDIT_DUMP_RUNNER,
  STYNX_AUDIT_OPTIONS,
} from '../../src/tokens';

describe('StynxAuditModule.forRoot', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wires default options and provider classes', () => {
    const module = StynxAuditModule.forRoot();
    const providers = module.providers ?? [];

    expect(providers).toEqual(expect.arrayContaining([
      expect.objectContaining({ provide: STYNX_AUDIT_OPTIONS, useValue: {} }),
      expect.objectContaining({ provide: STYNX_AUDIT_DUMP_RUNNER, useValue: null }),
      expect.objectContaining({ provide: STYNX_AUDIT_ARCHIVE_STORE, useValue: null }),
    ]));

    const clockProvider = providers.find((provider) =>
      typeof provider === 'object' && 'provide' in provider && provider.provide === STYNX_AUDIT_CLOCK,
    ) as { useClass: new () => { now(): Date } };
    expect(clockProvider.useClass).toEqual(expect.anything());
    expect(clockProvider.useClass.prototype.now()).toBeInstanceOf(Date);
  });

  it('starts and clears the daily detach scheduler only when all dependencies are configured', () => {
    vi.useFakeTimers();
    const module = StynxAuditModule.forRoot({
      dailyDetachEnabled: true,
      dailyDetachIntervalMs: 25,
      bucket: 'audit-archive',
    });
    const schedulerClass = (module.providers ?? []).find((provider) =>
      typeof provider === 'function' && provider.name.includes('AuditDailyDetachScheduler'),
    ) as new (...args: unknown[]) => { onModuleInit(): void; onModuleDestroy(): void };
    const auditService = { runDailyDetachJob: vi.fn(async () => undefined) };

    const inactive = new schedulerClass(auditService, { dailyDetachEnabled: false }, {}, {});
    inactive.onModuleInit();
    vi.advanceTimersByTime(50);
    expect(auditService.runDailyDetachJob).not.toHaveBeenCalledTimes(1);

    const active = new schedulerClass(
      auditService,
      { dailyDetachEnabled: true, dailyDetachIntervalMs: 25, bucket: 'audit-archive' },
      {},
      {},
    );
    active.onModuleInit();
    vi.advanceTimersByTime(25);
    expect(auditService.runDailyDetachJob).toHaveBeenCalledTimes(1);

    active.onModuleDestroy();
    vi.advanceTimersByTime(25);
    expect(auditService.runDailyDetachJob).toHaveBeenCalledTimes(1);
  });
});
