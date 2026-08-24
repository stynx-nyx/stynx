import { JobsRegistry, JobsWorker } from '../../src/index';

const job = { id: 'job-1', tenantId: 'tenant-1', scheduleId: null, jobType: 'sla.check', payload: {}, status: 'running' as const, priority: 0, attempts: 1, maxAttempts: 2, runAt: new Date(), lockedBy: 'worker', lockedUntil: null, startedAt: null, finishedAt: null, lastError: null, deadLetterReason: null, idempotencyKey: null, actorId: 'actor-1', createdAt: new Date(), updatedAt: new Date() };

describe('JobsWorker', () => {
  it('claims and completes registered work under repository system context', async () => {
    const repository = { inSystem: vi.fn(async (_r, fn) => fn()), executeHandler: vi.fn(async (item, fn) => fn(item.payload, { tenantId: item.tenantId, actorId: item.actorId, attempt: item.attempts })), claim: vi.fn().mockResolvedValue([job]), succeed: vi.fn(), fail: vi.fn() };
    const registry = new JobsRegistry(); const handler = vi.fn(); registry.register('sla.check', handler);
    await expect(new JobsWorker(repository as never, registry, { workerId: 'worker' }).tick()).resolves.toBe(1);
    expect(handler).toHaveBeenCalledWith({}, expect.objectContaining({ tenantId: 'tenant-1', actorId: 'actor-1', attempt: 1 }));
    expect(repository.succeed).toHaveBeenCalledWith('job-1', 'worker');
  });
  it('retries then dead-letters failed work', async () => {
    const repository = { inSystem: vi.fn(async (_r, fn) => fn()), executeHandler: vi.fn(async (item, fn) => fn(item.payload, { tenantId: item.tenantId, actorId: item.actorId, attempt: item.attempts })), claim: vi.fn().mockResolvedValue([job]), succeed: vi.fn(), fail: vi.fn() };
    const registry = new JobsRegistry(); registry.register('sla.check', async () => { throw new Error('boom'); });
    await new JobsWorker(repository as never, registry, { workerId: 'worker' }).tick();
    expect(repository.fail).toHaveBeenCalledWith('job-1', 'worker', 'boom', expect.any(Date));
  });
});
