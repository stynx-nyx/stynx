import { JobsRegistry, JobsScheduler, JobsWorker } from '../../src';
import type { ClockPort, JobExecutionResult, SchedulerOptions, TimerHandle, TimerPort, WorkerOptions } from '../../src';

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
  actorId: 'actor-1',
  createdAt: now,
  updatedAt: now,
};

function controlledTimer(withUnref = true) {
  const callbacks: Array<() => void> = [];
  const handles: TimerHandle[] = [];
  const port: TimerPort = {
    setInterval: vi.fn((callback: () => void) => {
      const handle: TimerHandle = withUnref ? { unref: vi.fn() } : {};
      callbacks.push(callback);
      handles.push(handle);
      return handle;
    }),
    clearInterval: vi.fn(),
  };
  return { port, callbacks, handles };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

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

  it('registers one injected scheduler timer, ticks controlled due rows, and clears its exact handle', async () => {
    const timer = controlledTimer(false);
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      materialize: vi.fn(async () => [{ id: 'schedule-1' }]),
    };
    const options: SchedulerOptions = { pollIntervalMs: 25, timer: timer.port };
    const scheduler = new JobsScheduler(repository as never, options);

    scheduler.start();
    scheduler.start();
    expect(timer.port.setInterval).toHaveBeenCalledTimes(1);
    expect(timer.port.setInterval).toHaveBeenCalledWith(expect.any(Function), 25);
    timer.callbacks[0]?.();
    expect(repository.materialize).toHaveBeenCalledTimes(1);
    expect(repository.inSystem).toHaveBeenCalledWith('jobs scheduler materialize due schedules', expect.any(Function));
    expect(repository.materialize).toHaveBeenCalledWith(25);
    scheduler.stop();
    expect(timer.port.clearInterval).toHaveBeenCalledTimes(1);
    expect(timer.port.clearInterval).toHaveBeenCalledWith(timer.handles[0]);
    scheduler.onModuleInit();
    expect(timer.port.setInterval).toHaveBeenCalledTimes(2);
    timer.callbacks[1]?.();
    expect(repository.materialize).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
    expect(timer.port.clearInterval).toHaveBeenCalledTimes(2);
    expect(timer.port.clearInterval).toHaveBeenLastCalledWith(timer.handles[1]);
    timer.callbacks[1]?.();
    expect(repository.materialize).toHaveBeenCalledTimes(2);
  });

  it('does not register a disabled scheduler timer and skips overlapping callbacks', async () => {
    const disabledTimer = controlledTimer();
    const disabled = new JobsScheduler({ materialize: vi.fn() } as never, {
      enabled: false,
      timer: disabledTimer.port,
    });
    disabled.start();
    expect(disabledTimer.port.setInterval).not.toHaveBeenCalled();

    const timer = controlledTimer();
    const pending = deferred<Array<{ id: string }>>();
    const tickFinished = deferred<void>();
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => {
        try { return await fn(); } finally { tickFinished.resolve(); }
      }),
      materialize: vi.fn(() => pending.promise),
    };
    const scheduler = new JobsScheduler(repository as never, { timer: timer.port });
    scheduler.start();
    timer.callbacks[0]?.();
    timer.callbacks[0]?.();
    expect(repository.materialize).toHaveBeenCalledTimes(1);
    scheduler.stop();
    timer.callbacks[0]?.();
    expect(repository.materialize).toHaveBeenCalledTimes(1);
    pending.resolve([]);
    await tickFinished.promise;
    expect(timer.port.clearInterval).toHaveBeenCalledWith(timer.handles[0]);
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
    expect(repository.inSystem).toHaveBeenLastCalledWith('jobs worker claim due jobs', expect.any(Function));
    expect(repository.claim).toHaveBeenLastCalledWith('worker-1', 4, 12_000);

    await new JobsWorker(repository as never, new JobsRegistry()).tick();
    expect(repository.claim).toHaveBeenLastCalledWith(
      expect.stringMatching(/^jobs-[0-9a-f-]{36}$/u),
      10,
      60_000,
    );
  });

  it('registers one injected worker timer, safely unreferences it, and clears the exact handle', async () => {
    const timer = controlledTimer();
    const disabledTimer = controlledTimer();
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      claim: vi.fn(async () => []),
    };
    const disabledWorker = new JobsWorker(repository as never, new JobsRegistry(), {
      workerId: 'disabled',
      enabled: false,
      timer: disabledTimer.port,
    });
    disabledWorker.start();
    expect(disabledTimer.port.setInterval).not.toHaveBeenCalled();
    const options: WorkerOptions = { workerId: 'worker-1', pollIntervalMs: 25, timer: timer.port };
    const worker = new JobsWorker(repository as never, new JobsRegistry(), options);

    worker.start();
    worker.start();
    expect(timer.port.setInterval).toHaveBeenCalledTimes(1);
    expect(timer.port.setInterval).toHaveBeenCalledWith(expect.any(Function), 25);
    expect(timer.handles[0]?.unref).toHaveBeenCalledTimes(1);
    timer.callbacks[0]?.();
    expect(repository.claim).toHaveBeenCalledTimes(1);
    worker.stop();
    expect(timer.port.clearInterval).toHaveBeenCalledWith(timer.handles[0]);
    worker.onModuleInit();
    expect(timer.port.setInterval).toHaveBeenCalledTimes(2);
    timer.callbacks[1]?.();
    expect(repository.claim).toHaveBeenCalledTimes(2);
    worker.onModuleDestroy();
    expect(timer.port.clearInterval).toHaveBeenLastCalledWith(timer.handles[1]);
    timer.callbacks[1]?.();
    expect(repository.claim).toHaveBeenCalledTimes(2);
  });

  it('finishes an in-flight worker outcome after stop and skips subsequent timer callbacks', async () => {
    const timer = controlledTimer(false);
    const pendingClaim = deferred<typeof job[]>();
    const outcomeFinished = deferred<void>();
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      claim: vi.fn(() => pendingClaim.promise),
      executeHandler: vi.fn(async (): Promise<JobExecutionResult> => ({ status: 'executed' })),
      succeed: vi.fn(async () => { outcomeFinished.resolve(); }),
      fail: vi.fn(async () => undefined),
    };
    const worker = new JobsWorker(repository as never, new JobsRegistry(), {
      workerId: 'worker-1',
      timer: timer.port,
      clock: { now: () => now.getTime() } satisfies ClockPort,
    });
    worker.start();
    timer.callbacks[0]?.();
    timer.callbacks[0]?.();
    worker.stop();
    timer.callbacks[0]?.();
    expect(repository.claim).toHaveBeenCalledTimes(1);
    pendingClaim.resolve([job]);
    await outcomeFinished.promise;
    expect(repository.succeed).toHaveBeenCalledWith('job-1', 'worker-1');
    expect(repository.inSystem).toHaveBeenCalledWith('jobs worker claim due jobs', expect.any(Function));
    expect(repository.inSystem).toHaveBeenCalledWith('jobs worker record job outcome', expect.any(Function));
  });

  it('completes successful work and schedules failed work strictly in the future', async () => {
    let activeSystemReason: string | undefined;
    const repository = {
      inSystem: vi.fn(async (reason: string, fn: () => unknown) => {
        const previous = activeSystemReason;
        activeSystemReason = reason;
        try { return await fn(); } finally { activeSystemReason = previous; }
      }),
      claim: vi.fn(async () => [job]),
      executeHandler: vi.fn(async (_job: unknown, handler: () => unknown): Promise<JobExecutionResult> => {
        await handler();
        return { status: 'executed' };
      }),
      succeed: vi.fn(async () => { expect(activeSystemReason).toBe('jobs worker record job outcome'); }),
      fail: vi.fn(async () => { expect(activeSystemReason).toBe('jobs worker record job outcome'); }),
    };
    const registry = new JobsRegistry();
    registry.register('email', async () => undefined);

    await expect(
      new JobsWorker(repository as never, registry, { workerId: 'worker-1' }).tick(),
    ).resolves.toBe(1);
    expect(repository.succeed).toHaveBeenCalledWith('job-1', 'worker-1');
    expect(repository.inSystem).toHaveBeenNthCalledWith(1, 'jobs worker claim due jobs', expect.any(Function));
    expect(repository.inSystem).toHaveBeenNthCalledWith(2, 'jobs worker record job outcome', expect.any(Function));
    expect(repository.fail).not.toHaveBeenCalled();

    registry.get = vi.fn(() => async () => Promise.reject(new Error('boom')));
    await new JobsWorker(repository as never, registry, { workerId: 'worker-1' }).tick();
    expect(repository.fail).toHaveBeenLastCalledWith('job-1', 'worker-1', 'boom', expect.any(Date));
    expect(repository.inSystem).toHaveBeenNthCalledWith(3, 'jobs worker claim due jobs', expect.any(Function));
    expect(repository.inSystem).toHaveBeenNthCalledWith(4, 'jobs worker record job outcome', expect.any(Function));
    const retryAt = repository.fail.mock.calls.at(-1)?.[3] as Date;
    expect(retryAt.getTime()).toBeGreaterThan(now.getTime());
    expect(repository.succeed).toHaveBeenCalledTimes(1);
  });

  it('dead-letters terminal failures and stringifies non-Error values', async () => {
    const terminalJob = { ...job, attempts: 2, maxAttempts: 2 };
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      claim: vi.fn(async () => [terminalJob]),
      executeHandler: vi.fn(async (_job: unknown, handler: () => unknown): Promise<JobExecutionResult> => {
        await handler();
        return { status: 'executed' };
      }),
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
