import {
  DuplicateJobTypeHandlerError,
  InvalidCronExpressionError,
  InvalidJobInputError,
  InvalidScheduleError,
  JobNotFoundError,
  JobsRegistry,
  JobsScheduler,
  JobsWorker,
  ScheduleNotFoundError,
  UnknownJobTypeError,
  normalizeBackoff,
  nextCronRunAt,
  parseCronExpression,
} from '../../src';
import { JobsRepository } from '../../src/jobs.repository';

const now = new Date('2026-08-25T00:00:00.000Z');
const job = {
  id: 'job-1',
  tenantId: 'tenant-1',
  scheduleId: null,
  jobType: 'test',
  payload: {},
  status: 'running' as const,
  priority: 1,
  attempts: 1,
  maxAttempts: 2,
  runAt: now,
  lockedBy: 'worker',
  lockedUntil: null,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  deadLetterReason: null,
  idempotencyKey: null,
  actorId: 'actor-1',
  createdAt: now,
  updatedAt: now,
};
const schedule = {
  id: 'schedule-1',
  tenantId: 'tenant-1',
  name: 'daily',
  jobType: 'test',
  kind: 'cron' as const,
  cronExpression: '0 1 * * *',
  intervalSeconds: null,
  payload: {},
  priority: 1,
  maxAttempts: 2,
  backoff: { baseMs: 1, maxMs: 10, multiplier: 2 },
  isEnabled: true,
  nextRunAt: now,
  lastEnqueuedAt: null,
  createdBy: null,
  createdAt: now,
  updatedAt: now,
};

describe('jobs repository, registry, scheduler, and validation depth', () => {
  it('covers registry and domain error contracts', () => {
    const registry = new JobsRegistry();
    const handler = vi.fn();
    registry.register('test', handler);
    expect(registry.get('test')).toBe(handler);
    expect(() => registry.register('test', handler)).toThrow(DuplicateJobTypeHandlerError);
    expect(() => registry.register(' ', handler)).toThrow(UnknownJobTypeError);
    expect(() => registry.get('missing')).toThrow(UnknownJobTypeError);

    for (const error of [
      new JobNotFoundError('job-1'),
      new ScheduleNotFoundError('schedule-1'),
      new InvalidScheduleError('bad'),
      new InvalidScheduleError('bad', { field: 'cron' }),
      new InvalidJobInputError('bad'),
      new InvalidJobInputError('bad', { field: 'payload' }),
      new InvalidCronExpressionError('bad'),
    ])
      expect(error.code).toMatch(/JOB|SCHEDULE|CRON/);
  });

  it('normalizes backoff and rejects every invalid numeric boundary', () => {
    const defaults = { baseMs: 10, maxMs: 100, multiplier: 2 };
    expect(normalizeBackoff({ maxMs: 50 }, defaults)).toEqual({
      baseMs: 10,
      maxMs: 50,
      multiplier: 2,
    });
    for (const policy of [
      { baseMs: Number.NaN },
      { baseMs: -1 },
      { maxMs: Number.NaN },
      { baseMs: 10, maxMs: 9 },
      { multiplier: Number.NaN },
      { multiplier: 0 },
    ])
      expect(() => normalizeBackoff(policy, defaults)).toThrow('Invalid job backoff policy');
  });

  it('accepts cron lists, ranges, and steps and rejects malformed segments', () => {
    expect(parseCronExpression('1,2 1-3 */2 1 0').minute).toEqual(new Set([1, 2]));
    expect(parseCronExpression('5/20 * * * *').minute).toEqual(new Set([5, 25, 45]));
    for (const expression of [
      '*/x * * * *',
      '*/0 * * * *',
      '*//2 * * * *',
      '/2 * * * *',
      'x * * * *',
      '10-2 * * * *',
      '* * * 13 *',
    ])
      expect(() => parseCronExpression(expression)).toThrow(InvalidCronExpressionError);
  });

  it('fails closed when a valid cron expression has no real date in the search horizon', () => {
    expect(() => nextCronRunAt('0 0 31 2 *', new Date('2026-01-01T00:00:00Z'))).toThrow(
      InvalidCronExpressionError,
    );
  });

  it('executes every repository boundary including actor and system contexts', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from jobs.schedules where is_enabled'))
        return {
          rows: [
            schedule,
            {
              ...schedule,
              id: 'schedule-2',
              kind: 'interval',
              cronExpression: null,
              intervalSeconds: 60,
            },
          ],
        };
      if (sql.includes('returning id, tenant_id') && sql.includes('jobs.schedules'))
        return { rows: [schedule] };
      if (sql.includes('select id, tenant_id') && sql.includes('jobs.schedules'))
        return { rows: [schedule] };
      if (sql.includes('returning id, tenant_id') || sql.includes('from jobs.jobs'))
        return { rows: [job], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const trx = { query };
    const database = {
      tx: vi.fn(async (fn: (value: typeof trx) => unknown) => fn(trx)),
      withSystemContext: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      withRequestContext: vi.fn(async (_context: unknown, fn: () => unknown) => fn()),
    };
    const repository = new JobsRepository(database as never);
    const handler = vi.fn(async () => undefined);

    await expect(repository.inSystem('test', async () => 42)).resolves.toBe(42);
    await repository.executeHandler(job, handler);
    await repository.executeHandler({ ...job, actorId: null }, handler);
    await expect(
      repository.enqueue({
        tenantId: 'tenant-1',
        jobType: 'test',
        payload: {},
        runAt: now,
        priority: 1,
        maxAttempts: 2,
      }),
    ).resolves.toEqual(job);
    await expect(repository.claim('worker', 2, 30_000)).resolves.toEqual([job]);
    await repository.succeed('job-1', 'worker');
    await repository.fail('job-1', 'worker', 'x'.repeat(5000), now);
    await expect(repository.getJob('job-1', 'tenant-1')).resolves.toEqual(job);
    await expect(repository.cancel('job-1', 'tenant-1')).resolves.toBe(true);
    await expect(
      repository.upsertSchedule({
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'test',
        kind: 'cron',
        cronExpression: '0 1 * * *',
        payload: {},
        priority: 1,
        maxAttempts: 2,
        backoff: schedule.backoff,
        nextRunAt: now,
        isEnabled: true,
      }),
    ).resolves.toEqual(schedule);
    await expect(repository.getSchedule('schedule-1', 'tenant-1')).resolves.toEqual(schedule);
    await repository.setScheduleEnabled('schedule-1', 'tenant-1', false);
    await repository.deleteSchedule('schedule-1', 'tenant-1');
    await expect(repository.materialize(5)).resolves.toHaveLength(2);
    expect(database.withRequestContext).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('drives scheduler and worker lifecycle defaults without leaking timers', async () => {
    vi.useFakeTimers();
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      materialize: vi.fn(async () => [schedule]),
      claim: vi.fn(async () => []),
    };
    const scheduler = new JobsScheduler(repository as never);
    await expect(scheduler.tick()).resolves.toBe(1);
    scheduler.onModuleInit();
    scheduler.start();
    scheduler.onModuleDestroy();

    const worker = new JobsWorker(repository as never, new JobsRegistry(), { workerId: 'worker' });
    await expect(worker.tick()).resolves.toBe(0);
    worker.onModuleInit();
    worker.start();
    worker.onModuleDestroy();
    new JobsScheduler(repository as never, { enabled: false }).start();
    new JobsWorker(repository as never, new JobsRegistry(), { enabled: false }).start();
    vi.useRealTimers();
  });

  it('covers nullable repository results and terminal string worker failures', async () => {
    const trx = { query: vi.fn(async () => ({ rows: [], rowCount: undefined })) };
    const database = { tx: vi.fn(async (fn: (value: typeof trx) => unknown) => fn(trx)) };
    const repository = new JobsRepository(database as never);
    await expect(repository.getJob('missing', 'tenant-1')).resolves.toEqual(null);
    await expect(repository.cancel('missing', 'tenant-1')).resolves.toBe(false);
    await expect(repository.getSchedule('missing', 'tenant-1')).resolves.toEqual(null);
    await repository.upsertSchedule({
      tenantId: 'tenant-1',
      name: 'interval',
      jobType: 'test',
      kind: 'interval',
      intervalSeconds: 60,
      payload: {},
      priority: 1,
      maxAttempts: 1,
      backoff: { baseMs: 1, maxMs: 2, multiplier: 2 },
      nextRunAt: now,
      createdBy: 'actor-1',
      isEnabled: false,
    });

    const failed = vi.fn();
    const workerRepository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      claim: vi.fn(async () => [{ ...job, attempts: 2, maxAttempts: 2, actorId: null }]),
      executeHandler: vi.fn(async (_item: unknown, handler: () => unknown) => handler()),
      succeed: vi.fn(),
      fail: failed,
    };
    const registry = new JobsRegistry();
    registry.register('test', async () => Promise.reject('string failure'));
    await new JobsWorker(workerRepository as never, registry, { workerId: 'worker' }).tick();
    expect(failed).toHaveBeenCalledWith('job-1', 'worker', 'string failure', null);
  });
});
