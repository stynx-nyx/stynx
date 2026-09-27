import { JobsRegistry, JobsWorker } from '../../src/index';
import type { ClockPort, JobExecutionResult } from '../../src/types';

const job = { id: 'job-1', tenantId: 'tenant-1', scheduleId: null, jobType: 'sla.check', payload: {}, status: 'running' as const, priority: 0, attempts: 1, maxAttempts: 2, runAt: new Date(), lockedBy: 'worker', lockedUntil: null, startedAt: null, finishedAt: null, lastError: null, deadLetterReason: null, idempotencyKey: null, actorId: 'actor-1', createdAt: new Date(), updatedAt: new Date() };

describe('JobsWorker', () => {
  it('claims and completes registered work under repository system context', async () => {
    const repository = { inSystem: vi.fn(async (_r, fn) => fn()), executeHandler: vi.fn(async (item, fn): Promise<JobExecutionResult> => { await fn(item.payload, { tenantId: item.tenantId, actorId: item.actorId, attempt: item.attempts }); return { status: 'executed' }; }), claim: vi.fn().mockResolvedValue([job]), succeed: vi.fn(), fail: vi.fn() };
    const registry = new JobsRegistry(); const handler = vi.fn(); registry.register('sla.check', handler);
    await expect(new JobsWorker(repository as never, registry, { workerId: 'worker' }).tick()).resolves.toBe(1);
    expect(handler).toHaveBeenCalledWith({}, expect.objectContaining({ tenantId: 'tenant-1', actorId: 'actor-1', attempt: 1 }));
    expect(repository.succeed).toHaveBeenCalledWith('job-1', 'worker');
    expect(repository.inSystem).toHaveBeenCalledWith('jobs worker claim due jobs', expect.any(Function));
    expect(repository.inSystem).toHaveBeenCalledWith('jobs worker record job outcome', expect.any(Function));
  });
  it('retries then dead-letters failed work', async () => {
    const repository = { inSystem: vi.fn(async (_r, fn) => fn()), executeHandler: vi.fn(async (item, fn): Promise<JobExecutionResult> => { await fn(item.payload, { tenantId: item.tenantId, actorId: item.actorId, attempt: item.attempts }); return { status: 'executed' }; }), claim: vi.fn().mockResolvedValue([job]), succeed: vi.fn(), fail: vi.fn() };
    const registry = new JobsRegistry(); registry.register('sla.check', async () => { throw new Error('boom'); });
    const clockNow = Date.parse('2026-08-24T10:00:00.000Z');
    const clock: ClockPort = { now: () => clockNow };
    await new JobsWorker(repository as never, registry, { workerId: 'worker', clock }).tick();
    expect(repository.fail).toHaveBeenCalledWith('job-1', 'worker', 'boom', expect.any(Date));
    const retryAt = repository.fail.mock.calls[0]?.[3] as Date;
    expect(retryAt.getTime()).toBeGreaterThanOrEqual(clockNow);
    expect(retryAt.getTime()).toBeLessThanOrEqual(clockNow + 1_000);
    expect(repository.inSystem).toHaveBeenCalledWith('jobs worker claim due jobs', expect.any(Function));
    expect(repository.inSystem).toHaveBeenCalledWith('jobs worker record job outcome', expect.any(Function));
  });

  it('dead-letters a claimed actorless unregistered job without looking up or executing it', async () => {
    const actorless = { ...job, actorId: null, jobType: 'unregistered', attempts: 9, maxAttempts: 1 };
    let activeSystemReason: string | undefined;
    const repository = {
      inSystem: vi.fn(async (reason: string, fn: () => unknown) => {
        const previous = activeSystemReason;
        activeSystemReason = reason;
        try { return await fn(); } finally { activeSystemReason = previous; }
      }),
      claim: vi.fn(async () => [actorless]),
      executeHandler: vi.fn(),
      deadLetter: vi.fn(async () => { expect(activeSystemReason).toBe('jobs worker record job outcome'); }),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const registry = new JobsRegistry();
    const handler = vi.fn();
    registry.register('registered', handler);
    const lookup = vi.spyOn(registry, 'get');

    await expect(new JobsWorker(repository as never, registry, { workerId: 'worker' }).tick()).resolves.toBe(1);
    expect(lookup).not.toHaveBeenCalled();
    expect(repository.executeHandler).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(repository.deadLetter).toHaveBeenCalledTimes(1);
    expect(repository.deadLetter).toHaveBeenCalledWith('job-1', 'worker', 'missing_actor');
    expect(repository.fail).not.toHaveBeenCalled();
    expect(repository.inSystem).toHaveBeenNthCalledWith(1, 'jobs worker claim due jobs', expect.any(Function));
    expect(repository.inSystem).toHaveBeenNthCalledWith(2, 'jobs worker record job outcome', expect.any(Function));
  });

  it('dead-letters a claimed job with a missing tenant before handler lookup', async () => {
    const tenantless = { ...job, tenantId: null, jobType: 'unregistered' };
    const repository = {
      inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      claim: vi.fn(async () => [tenantless]),
      executeHandler: vi.fn(),
      deadLetter: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const registry = new JobsRegistry();
    const handler = vi.fn();
    registry.register('registered', handler);
    const lookup = vi.spyOn(registry, 'get');
    await new JobsWorker(repository as never, registry, { workerId: 'worker' }).tick();
    expect(lookup).not.toHaveBeenCalled();
    expect(repository.executeHandler).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(repository.deadLetter).toHaveBeenCalledTimes(1);
    expect(repository.deadLetter).toHaveBeenCalledWith('job-1', 'worker', 'missing_actor');
    expect(repository.fail).not.toHaveBeenCalled();
    expect(repository.inSystem).toHaveBeenNthCalledWith(2, 'jobs worker record job outcome', expect.any(Function));
  });

  it('records a not-executable outcome in one fresh per-job system scope', async () => {
    let activeSystemReason: string | undefined;
    const handler = vi.fn();
    const repository = {
      inSystem: vi.fn(async (reason: string, fn: () => unknown) => {
        const previous = activeSystemReason;
        activeSystemReason = reason;
        try { return await fn(); } finally { activeSystemReason = previous; }
      }),
      claim: vi.fn(async () => [job]),
      executeHandler: vi.fn(async (): Promise<JobExecutionResult> => ({
        status: 'not_executable',
        reason: 'inactive_actor_membership',
      })),
      deadLetter: vi.fn(async () => { expect(activeSystemReason).toBe('jobs worker record job outcome'); }),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
    const registry = new JobsRegistry();
    registry.register('sla.check', handler);

    await new JobsWorker(repository as never, registry, { workerId: 'worker' }).tick();
    expect(repository.deadLetter).toHaveBeenCalledTimes(1);
    expect(repository.deadLetter).toHaveBeenCalledWith('job-1', 'worker', 'inactive_actor_membership');
    expect(repository.succeed).not.toHaveBeenCalled();
    expect(repository.fail).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(repository.inSystem).toHaveBeenNthCalledWith(1, 'jobs worker claim due jobs', expect.any(Function));
    expect(repository.inSystem).toHaveBeenNthCalledWith(2, 'jobs worker record job outcome', expect.any(Function));
  });
});
