import { JobsRegistry, JobsScheduler, JobsWorker } from '../../src';

const now = new Date('2026-08-26T10:00:00.000Z');
const job = {
  id: 'job-1',
  tenantId: 'tenant-1',
  scheduleId: null,
  jobType: 'email',
  payload: {},
  status: 'running' as const,
  priority: 0,
  attempts: 1,
  maxAttempts: 2,
  runAt: now,
  lockedBy: 'worker-1',
  lockedUntil: null,
  startedAt: now,
  finishedAt: null,
  lastError: null,
  deadLetterReason: null,
  idempotencyKey: null,
  actorId: null,
  createdAt: now,
  updatedAt: now,
};

describe('jobs scheduler and worker lifecycle contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks the scheduler with its configured batch and exact system reason', async () => {
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      materialize: vi.fn(async () => [{ id: 'schedule-1' }]),
    };
    const scheduler = new JobsScheduler(repository as never, { batchSize: 3 });

    await expect(scheduler.tick()).resolves.toBe(1);
    expect(repository.inSystem).toHaveBeenCalledWith(
      'jobs scheduler materialize due schedules',
      expect.any(Function),
    );
    expect(repository.materialize).toHaveBeenCalledWith(3);

    const defaultScheduler = new JobsScheduler(repository as never);
    await defaultScheduler.tick();
    expect(repository.materialize).toHaveBeenLastCalledWith(25);
  });

  it('starts one scheduler timer, runs module hooks, and stops deterministically', async () => {
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      materialize: vi.fn(async () => []),
    };
    const scheduler = new JobsScheduler(repository as never, { pollIntervalMs: 25 });

    scheduler.start();
    scheduler.start();
    await vi.advanceTimersByTimeAsync(25);
    expect(repository.materialize).toHaveBeenCalledTimes(1);
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(50);
    expect(repository.materialize).toHaveBeenCalledTimes(1);

    scheduler.onModuleInit();
    await vi.advanceTimersByTimeAsync(25);
    expect(repository.materialize).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(25);
    expect(repository.materialize).toHaveBeenCalledTimes(2);

    const disabled = new JobsScheduler(repository as never, { enabled: false, pollIntervalMs: 1 });
    disabled.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(repository.materialize).toHaveBeenCalledTimes(2);
    disabled.stop();
  });

  it('claims with exact worker options and produces a nonempty generated worker id', async () => {
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      claim: vi.fn(async () => []),
    };

    await expect(
      new JobsWorker(repository as never, new JobsRegistry(), {
        workerId: 'worker-1',
        batchSize: 4,
        visibilityTimeoutMs: 12_000,
      }).tick(),
    ).resolves.toBe(0);
    expect(repository.inSystem).toHaveBeenLastCalledWith(
      'jobs worker claim and execute',
      expect.any(Function),
    );
    expect(repository.claim).toHaveBeenLastCalledWith('worker-1', 4, 12_000);

    await new JobsWorker(repository as never, new JobsRegistry()).tick();
    expect(repository.claim).toHaveBeenLastCalledWith(
      expect.stringMatching(/^jobs-[0-9a-f-]{36}$/u),
      10,
      60_000,
    );
  });

  it('starts one worker timer, runs module hooks, and stops deterministically', async () => {
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      claim: vi.fn(async () => []),
    };
    const worker = new JobsWorker(repository as never, new JobsRegistry(), {
      workerId: 'worker-1',
      pollIntervalMs: 25,
    });

    worker.start();
    worker.start();
    await vi.advanceTimersByTimeAsync(25);
    expect(repository.claim).toHaveBeenCalledTimes(1);
    worker.stop();
    await vi.advanceTimersByTimeAsync(50);
    expect(repository.claim).toHaveBeenCalledTimes(1);

    worker.onModuleInit();
    await vi.advanceTimersByTimeAsync(25);
    expect(repository.claim).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(25);
    expect(repository.claim).toHaveBeenCalledTimes(2);

    const disabled = new JobsWorker(repository as never, new JobsRegistry(), {
      enabled: false,
      workerId: 'disabled',
      pollIntervalMs: 1,
    });
    disabled.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(repository.claim).toHaveBeenCalledTimes(2);
    disabled.stop();
  });

  it('completes successful work and schedules failed work strictly in the future', async () => {
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      claim: vi.fn(async () => [job]),
      executeHandler: vi.fn(async (_job: unknown, handler: () => unknown) => handler()),
      succeed: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    };
    const registry = new JobsRegistry();
    registry.register('email', async () => undefined);

    await expect(
      new JobsWorker(repository as never, registry, { workerId: 'worker-1' }).tick(),
    ).resolves.toBe(1);
    expect(repository.succeed).toHaveBeenCalledWith('job-1', 'worker-1');
    expect(repository.fail).not.toHaveBeenCalled();

    registry.get = vi.fn(() => async () => Promise.reject(new Error('boom')));
    await new JobsWorker(repository as never, registry, { workerId: 'worker-1' }).tick();
    expect(repository.fail).toHaveBeenLastCalledWith('job-1', 'worker-1', 'boom', expect.any(Date));
    const retryAt = repository.fail.mock.calls.at(-1)?.[3] as Date;
    expect(retryAt.getTime()).toBeGreaterThan(now.getTime());
    expect(repository.succeed).toHaveBeenCalledTimes(1);
  });

  it('dead-letters terminal failures and stringifies non-Error values', async () => {
    const terminalJob = { ...job, attempts: 2, maxAttempts: 2 };
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      claim: vi.fn(async () => [terminalJob]),
      executeHandler: vi.fn(async (_job: unknown, handler: () => unknown) => handler()),
      succeed: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    };
    const registry = new JobsRegistry();
    registry.register('email', async () => Promise.reject('terminal failure'));

    await new JobsWorker(repository as never, registry, { workerId: 'worker-1' }).tick();
    expect(repository.fail).toHaveBeenCalledWith('job-1', 'worker-1', 'terminal failure', null);
    expect(repository.succeed).not.toHaveBeenCalled();
  });
});
