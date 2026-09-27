import {
  DEFAULT_BACKOFF_POLICY,
  DEFAULT_MAX_ATTEMPTS,
  InvalidJobInputError,
  InvalidScheduleError,
  JobsService,
  normalizeBackoff,
  JobTenantMismatchError,
  JobActorMembershipError,
  JobActorAssignmentDeniedError,
} from '../../src';
import { RequestContext, RequestContextMutator, RequestContextMissingError } from '@stynx-nyx/core';
import { ActorContextMissingError, TenantContextMissingError } from '@stynx-nyx/data';

const now = new Date('2026-08-26T10:00:00.000Z');
const job = { id: 'job-1' };
const schedule = { id: 'schedule-1' };
const actor1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const randomRequestId = '018f5502-9f95-7c6b-8c74-d1173ec95f14';

class FakeClsService {
  private store = new Map<PropertyKey, unknown>();
  get<T>(key: PropertyKey): T | undefined { return this.store.get(key) as T | undefined; }
  set(key: PropertyKey, value: unknown): void { this.store.set(key, value); }
  runWith<T>(store: Record<PropertyKey, unknown>, fn: () => Promise<T> | T): Promise<T> | T {
    const previous = this.store;
    this.store = new Map(Reflect.ownKeys(store).map((key) => [key, store[key]]));
    let asynchronous = false;
    try {
      const result = fn();
      if (result instanceof Promise) {
        asynchronous = true;
        return result.finally(() => { this.store = previous; });
      }
      return result;
    } finally {
      if (!asynchronous) this.store = previous;
    }
  }
}

function createHarness() {
  const cls = new FakeClsService();
  const requestContext = new RequestContext(cls as never);
  const mutator = new RequestContextMutator(cls as never);
  const repository = {
    inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
    enqueue: vi.fn(async () => job),
    getJob: vi.fn(async () => job),
    cancel: vi.fn(async () => true),
    upsertSchedule: vi.fn(async () => schedule),
    getSchedule: vi.fn(async () => schedule),
    setScheduleEnabled: vi.fn(async () => undefined),
    deleteSchedule: vi.fn(async () => undefined),
    isActiveTenantMember: vi.fn(async () => true),
  };
  const options = { authorizeTechnicalActor: vi.fn(async () => true) };
  return { repository, requestContext, mutator, options,
    service: new JobsService(repository as never, requestContext, options) };
}

function inTenant<T>(harness: ReturnType<typeof createHarness>, tenantId: string,
  fn: () => Promise<T> | T, actorId = actor1): Promise<T> | T {
  return harness.mutator.runWithRequestContext({
    requestId: '018f5502-9f95-7c6b-8c74-d1173ec95f14', startedAt: now, tenantId, actorId,
  }, fn);
}

describe('JobsService behavioral contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueues defaults and explicit options under the caller tenant boundary', async () => {
    const harness = createHarness();
    const { repository, service } = harness;

    await expect(inTenant(harness, 'tenant-1', () => service.enqueue({ tenantId: 'tenant-1', jobType: 'email' }))).resolves.toBe(job);
    expect(repository.inSystem).not.toHaveBeenCalled();
    expect(repository.enqueue).toHaveBeenLastCalledWith({
      tenantId: 'tenant-1',
      jobType: 'email',
      payload: {},
      runAt: now,
      priority: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      actorId: actor1,
    });

    const runAt = new Date('2026-08-27T10:00:00.000Z');
    await inTenant(harness, 'tenant-2', () => service.enqueue({
      tenantId: 'tenant-2',
      jobType: 'report',
      payload: { format: 'pdf' },
      runAt,
      priority: 7,
      maxAttempts: 9,
      idempotencyKey: 'report-1',
      actorId: actor2,
    }), actor2);
    expect(repository.enqueue).toHaveBeenLastCalledWith({
      tenantId: 'tenant-2',
      jobType: 'report',
      payload: { format: 'pdf' },
      runAt,
      priority: 7,
      maxAttempts: 9,
      idempotencyKey: 'report-1',
      actorId: actor2,
    });

    await inTenant(harness, 'tenant-1', () => service.enqueue({ tenantId: 'tenant-1', jobType: 'delayed', delayMs: 250 }));
    expect(repository.enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ runAt: new Date(now.getTime() + 250) }),
    );

    await inTenant(harness, 'tenant-1', () => service.enqueue({ tenantId: 'tenant-1', jobType: 'immediate', delayMs: 0 }));
    expect(repository.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ runAt: now }));
  });

  it('rejects every invalid enqueue boundary before repository access', async () => {
    const harness = createHarness();
    const { repository, service } = harness;
    const invalid = [
      { tenantId: 'tenant-1', jobType: ' ' },
      { tenantId: '', jobType: 'email' },
      { tenantId: 'tenant-1', jobType: 'email', runAt: now, delayMs: 1 },
      { tenantId: 'tenant-1', jobType: 'email', delayMs: -1 },
    ];

    for (const input of invalid)
      await expect(inTenant(harness, 'tenant-1', () => service.enqueue(input))).rejects.toBeInstanceOf(InvalidJobInputError);
    await expect(inTenant(harness, 'tenant-1', () => service.enqueue(invalid[0]))).rejects.toThrow(
      'Invalid job input: jobType, tenantId, and a non-negative exclusive delay/runAt are required',
    );
    expect(repository.enqueue).not.toHaveBeenCalled();
  });

  it('accepts every valid inclusive backoff boundary', () => {
    expect(
      normalizeBackoff(
        { baseMs: 0, maxMs: 0, multiplier: 1 },
        { baseMs: 10, maxMs: 100, multiplier: 2 },
      ),
    ).toEqual({ baseMs: 0, maxMs: 0, multiplier: 1 });
  });

  it('reads and cancels tenant jobs and rejects an absent tenant', async () => {
    const harness = createHarness();
    const { repository, service } = harness;

    await expect(inTenant(harness, 'tenant-1', () => service.getJob('job-1', 'tenant-1'))).resolves.toBe(job);
    expect(repository.inSystem).not.toHaveBeenCalled();
    expect(repository.getJob).toHaveBeenCalledWith('job-1', 'tenant-1');
    expect(() =>
      (service.getJob as (jobId: string, tenantId?: string) => unknown)('job-1'),
    ).toThrow('Invalid job input: tenantId is required');

    await expect(inTenant(harness, 'tenant-1', () => service.cancel('job-1', 'tenant-1'))).resolves.toBe(true);
    expect(repository.inSystem).not.toHaveBeenCalled();
    expect(repository.cancel).toHaveBeenCalledWith('job-1', 'tenant-1');
    expect(() => service.cancel('job-1')).toThrow('Invalid job input: tenantId is required');
  });

  it('upserts cron and interval schedules with exact defaults and overrides', async () => {
    const harness = createHarness();
    const { repository, service } = harness;

    await expect(inTenant(harness, 'tenant-1', () =>
      service.upsertSchedule({
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'report',
        kind: 'cron',
        cronExpression: '0 11 * * *',
        actorId: actor1,
      })),
    ).resolves.toBe(schedule);
    expect(repository.inSystem).not.toHaveBeenCalled();
    expect(repository.upsertSchedule).toHaveBeenLastCalledWith({
      tenantId: 'tenant-1',
      name: 'daily',
      jobType: 'report',
      kind: 'cron',
      cronExpression: '0 11 * * *',
      actorId: actor1,
      timezone: 'UTC',
      payload: {},
      priority: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      backoff: DEFAULT_BACKOFF_POLICY,
      nextRunAt: new Date('2026-08-26T11:00:00.000Z'),
      isEnabled: true,
    });

    await inTenant(harness, 'tenant-2', () => service.upsertSchedule({
      tenantId: 'tenant-2',
      name: 'frequent',
      jobType: 'sync',
      kind: 'interval',
      intervalSeconds: 60,
      payload: { cursor: 1 },
      priority: 4,
      maxAttempts: 8,
      backoff: { baseMs: 25, maxMs: 200, multiplier: 3 },
      createdBy: 'actor-2',
      actorId: actor2,
      isEnabled: false,
    }), actor2);
    expect(repository.upsertSchedule).toHaveBeenLastCalledWith({
      tenantId: 'tenant-2',
      name: 'frequent',
      jobType: 'sync',
      kind: 'interval',
      intervalSeconds: 60,
      actorId: actor2,
      timezone: 'UTC',
      payload: { cursor: 1 },
      priority: 4,
      maxAttempts: 8,
      backoff: { baseMs: 25, maxMs: 200, multiplier: 3 },
      nextRunAt: new Date(now.getTime() + 60_000),
      createdBy: 'actor-2',
      isEnabled: false,
    });
    expect(service.defaultBackoff).toBe(DEFAULT_BACKOFF_POLICY);
  });

  it('rejects malformed schedule identities and mutually inconsistent cadence inputs', async () => {
    const harness = createHarness();
    const { repository, service } = harness;
    const invalid = [
      { tenantId: '', name: 'daily', jobType: 'report', kind: 'cron', cronExpression: '* * * * *' },
      {
        tenantId: 'tenant-1',
        name: ' ',
        jobType: 'report',
        kind: 'cron',
        cronExpression: '* * * * *',
      },
      {
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: ' ',
        kind: 'cron',
        cronExpression: '* * * * *',
      },
      { tenantId: 'tenant-1', name: 'daily', jobType: 'report', kind: 'cron' },
      {
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'report',
        kind: 'cron',
        cronExpression: '* * * * *',
        intervalSeconds: 1,
      },
      {
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'report',
        kind: 'interval',
        intervalSeconds: 0,
      },
      {
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'report',
        kind: 'interval',
        intervalSeconds: 1.5,
      },
      {
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'report',
        kind: 'interval',
        intervalSeconds: 1,
        cronExpression: '* * * * *',
      },
      {
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'report',
        kind: 'interval',
        cronExpression: '* * * * *',
      },
      {
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'report',
        kind: 'cron',
        intervalSeconds: 60,
      },
    ] as const;

    for (const input of invalid)
      await expect(inTenant(harness, 'tenant-1', () => service.upsertSchedule({ ...input, actorId: actor1 }))).rejects.toBeInstanceOf(InvalidScheduleError);
    await expect(inTenant(harness, 'tenant-1', () => service.upsertSchedule({ ...invalid[0], actorId: actor1 }))).rejects.toThrow(
      'Invalid schedule: tenantId, name, and jobType are required',
    );
    await expect(inTenant(harness, 'tenant-1', () => service.upsertSchedule({ ...invalid[3], actorId: actor1 }))).rejects.toThrow(
      'Invalid schedule: cron requires cronExpression; interval requires positive intervalSeconds',
    );
    expect(repository.upsertSchedule).not.toHaveBeenCalled();
  });

  it('routes schedule reads and state transitions with exact tenant guards', async () => {
    const harness = createHarness();
    const { repository, service } = harness;

    await expect(inTenant(harness, 'tenant-1', () => service.getSchedule('schedule-1', 'tenant-1'))).resolves.toBe(schedule);
    expect(repository.inSystem).not.toHaveBeenCalled();
    expect(repository.getSchedule).toHaveBeenCalledWith('schedule-1', 'tenant-1');
    expect(() => service.getSchedule('schedule-1')).toThrow(
      'Invalid schedule: tenantId is required',
    );

    await inTenant(harness, 'tenant-1', () => service.pauseSchedule('schedule-1', 'tenant-1'));
    expect(repository.inSystem).not.toHaveBeenCalled();
    expect(repository.setScheduleEnabled).toHaveBeenLastCalledWith('schedule-1', 'tenant-1', false);
    expect(() => service.pauseSchedule('schedule-1')).toThrow(
      'Invalid schedule: tenantId is required',
    );

    await inTenant(harness, 'tenant-1', () => service.resumeSchedule('schedule-1', 'tenant-1'));
    expect(repository.inSystem).not.toHaveBeenCalled();
    expect(repository.setScheduleEnabled).toHaveBeenLastCalledWith('schedule-1', 'tenant-1', true);
    expect(() => service.resumeSchedule('schedule-1')).toThrow(
      'Invalid schedule: tenantId is required',
    );

    await inTenant(harness, 'tenant-1', () => service.deleteSchedule('schedule-1', 'tenant-1'));
    expect(repository.inSystem).not.toHaveBeenCalled();
    expect(repository.deleteSchedule).toHaveBeenCalledWith('schedule-1', 'tenant-1');
    expect(() => service.deleteSchedule('schedule-1')).toThrow(
      'Invalid schedule: tenantId is required',
    );
  });

  it('checks active context and tenant equality before any of the eight repository operations', async () => {
    const harness = createHarness();
    const { repository, service, mutator } = harness;
    const operations = [
      () => service.enqueue({ tenantId: 'tenant-2', jobType: 'email' }),
      () => service.getJob('job-1', 'tenant-2'),
      () => service.cancel('job-1', 'tenant-2'),
      () => service.upsertSchedule({ tenantId: 'tenant-2', name: 'daily', jobType: 'email', kind: 'interval', intervalSeconds: 60, actorId: actor1 }),
      () => service.getSchedule('schedule-1', 'tenant-2'),
      () => service.pauseSchedule('schedule-1', 'tenant-2'),
      () => service.resumeSchedule('schedule-1', 'tenant-2'),
      () => service.deleteSchedule('schedule-1', 'tenant-2'),
    ];
    for (const operation of operations) {
      await expect(operation()).rejects.toBeInstanceOf(RequestContextMissingError);
      await expect(mutator.runWithRequestContext({ requestId: randomRequestId, startedAt: now }, operation))
        .rejects.toBeInstanceOf(TenantContextMissingError);
      await expect(mutator.runWithRequestContext({ requestId: randomRequestId, startedAt: now, tenantId: 'tenant-1' }, operation))
        .rejects.toBeInstanceOf(ActorContextMissingError);
      await expect(inTenant(harness, 'tenant-1', operation)).rejects.toBeInstanceOf(JobTenantMismatchError);
    }
    expect(repository.inSystem).not.toHaveBeenCalled();
    expect(repository.enqueue).not.toHaveBeenCalled();
    expect(repository.getJob).not.toHaveBeenCalled();
    expect(repository.cancel).not.toHaveBeenCalled();
    expect(repository.upsertSchedule).not.toHaveBeenCalled();
    expect(repository.getSchedule).not.toHaveBeenCalled();
    expect(repository.setScheduleEnabled).not.toHaveBeenCalled();
    expect(repository.deleteSchedule).not.toHaveBeenCalled();
  });

  it('requires active membership and permission for a different technical actor', async () => {
    const harness = createHarness();
    const { repository, service, options } = harness;
    repository.isActiveTenantMember.mockResolvedValueOnce(false);
    await expect(inTenant(harness, 'tenant-1', () => service.enqueue({ tenantId: 'tenant-1', jobType: 'email' })))
      .rejects.toBeInstanceOf(JobActorMembershipError);
    expect(repository.isActiveTenantMember).toHaveBeenCalledWith('tenant-1', actor1);
    expect(repository.enqueue).not.toHaveBeenCalled();
    expect(options.authorizeTechnicalActor).not.toHaveBeenCalled();

    repository.isActiveTenantMember.mockResolvedValueOnce(false);
    await expect(inTenant(harness, 'tenant-1', () => service.upsertSchedule({
      tenantId: 'tenant-1', name: 'daily', jobType: 'email', kind: 'interval',
      intervalSeconds: 60, actorId: actor2,
    }))).rejects.toBeInstanceOf(JobActorMembershipError);
    expect(repository.upsertSchedule).not.toHaveBeenCalled();
    expect(options.authorizeTechnicalActor).not.toHaveBeenCalled();

    options.authorizeTechnicalActor.mockResolvedValueOnce(false);
    await expect(inTenant(harness, 'tenant-1', () => service.enqueue({
      tenantId: 'tenant-1', jobType: 'email', actorId: actor2,
    }))).rejects.toBeInstanceOf(JobActorAssignmentDeniedError);
    expect(options.authorizeTechnicalActor).toHaveBeenCalledWith({
      tenantId: 'tenant-1', callerActorId: actor1, technicalActorId: actor2,
      permission: 'jobs.assignTechnicalActor',
    });
    expect(repository.enqueue).not.toHaveBeenCalled();

    const noPermission = createHarness();
    const noPermissionService = new JobsService(
      noPermission.repository as never, noPermission.requestContext, {},
    );
    await expect(inTenant(noPermission, 'tenant-1', () => noPermissionService.enqueue({
      tenantId: 'tenant-1', jobType: 'email', actorId: actor2,
    }))).rejects.toBeInstanceOf(JobActorAssignmentDeniedError);
    expect(noPermission.repository.enqueue).not.toHaveBeenCalled();

    await inTenant(harness, 'tenant-1', () => service.enqueue({
      tenantId: 'tenant-1', jobType: 'email', actorId: actor2,
    }));
    expect(repository.enqueue).toHaveBeenLastCalledWith({
      tenantId: 'tenant-1', jobType: 'email', payload: {}, runAt: now,
      priority: 0, maxAttempts: DEFAULT_MAX_ATTEMPTS, actorId: actor2,
    });
  });
});
