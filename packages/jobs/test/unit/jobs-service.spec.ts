import {
  DEFAULT_BACKOFF_POLICY,
  DEFAULT_MAX_ATTEMPTS,
  InvalidJobInputError,
  InvalidScheduleError,
  JobsService,
  normalizeBackoff,
} from '../../src';

const now = new Date('2026-08-26T10:00:00.000Z');
const job = { id: 'job-1' };
const schedule = { id: 'schedule-1' };

function createHarness() {
  const repository = {
    inSystem: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
    enqueue: vi.fn(async () => job),
    getJob: vi.fn(async () => job),
    cancel: vi.fn(async () => true),
    upsertSchedule: vi.fn(async () => schedule),
    getSchedule: vi.fn(async () => schedule),
    setScheduleEnabled: vi.fn(async () => undefined),
    deleteSchedule: vi.fn(async () => undefined),
  };
  return { repository, service: new JobsService(repository as never) };
}

describe('JobsService behavioral contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueues defaults and explicit options under the system boundary', async () => {
    const { repository, service } = createHarness();

    await expect(service.enqueue({ tenantId: 'tenant-1', jobType: 'email' })).resolves.toBe(job);
    expect(repository.inSystem).toHaveBeenLastCalledWith(
      'jobs enqueue one-shot job',
      expect.any(Function),
    );
    expect(repository.enqueue).toHaveBeenLastCalledWith({
      tenantId: 'tenant-1',
      jobType: 'email',
      payload: {},
      runAt: now,
      priority: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });

    const runAt = new Date('2026-08-27T10:00:00.000Z');
    await service.enqueue({
      tenantId: 'tenant-2',
      jobType: 'report',
      payload: { format: 'pdf' },
      runAt,
      priority: 7,
      maxAttempts: 9,
      idempotencyKey: 'report-1',
      actorId: 'actor-1',
    });
    expect(repository.enqueue).toHaveBeenLastCalledWith({
      tenantId: 'tenant-2',
      jobType: 'report',
      payload: { format: 'pdf' },
      runAt,
      priority: 7,
      maxAttempts: 9,
      idempotencyKey: 'report-1',
      actorId: 'actor-1',
    });

    await service.enqueue({ tenantId: 'tenant-1', jobType: 'delayed', delayMs: 250 });
    expect(repository.enqueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ runAt: new Date(now.getTime() + 250) }),
    );

    await service.enqueue({ tenantId: 'tenant-1', jobType: 'immediate', delayMs: 0 });
    expect(repository.enqueue).toHaveBeenLastCalledWith(expect.objectContaining({ runAt: now }));
  });

  it('rejects every invalid enqueue boundary before repository access', async () => {
    const { repository, service } = createHarness();
    const invalid = [
      { tenantId: 'tenant-1', jobType: ' ' },
      { tenantId: '', jobType: 'email' },
      { tenantId: 'tenant-1', jobType: 'email', runAt: now, delayMs: 1 },
      { tenantId: 'tenant-1', jobType: 'email', delayMs: -1 },
    ];

    for (const input of invalid)
      await expect(service.enqueue(input)).rejects.toBeInstanceOf(InvalidJobInputError);
    await expect(service.enqueue(invalid[0])).rejects.toThrow(
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
    const { repository, service } = createHarness();

    await expect(service.getJob('job-1', 'tenant-1')).resolves.toBe(job);
    expect(repository.inSystem).toHaveBeenLastCalledWith(
      'jobs read tenant job',
      expect.any(Function),
    );
    expect(repository.getJob).toHaveBeenCalledWith('job-1', 'tenant-1');
    expect(() =>
      (service.getJob as (jobId: string, tenantId?: string) => unknown)('job-1'),
    ).toThrow('Invalid job input: tenantId is required');

    await expect(service.cancel('job-1', 'tenant-1')).resolves.toBe(true);
    expect(repository.inSystem).toHaveBeenLastCalledWith(
      'jobs cancel tenant job',
      expect.any(Function),
    );
    expect(repository.cancel).toHaveBeenCalledWith('job-1', 'tenant-1');
    expect(() => service.cancel('job-1')).toThrow('Invalid job input: tenantId is required');
  });

  it('upserts cron and interval schedules with exact defaults and overrides', async () => {
    const { repository, service } = createHarness();

    await expect(
      service.upsertSchedule({
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'report',
        kind: 'cron',
        cronExpression: '0 11 * * *',
      }),
    ).resolves.toBe(schedule);
    expect(repository.inSystem).toHaveBeenLastCalledWith(
      'jobs upsert recurring schedule',
      expect.any(Function),
    );
    expect(repository.upsertSchedule).toHaveBeenLastCalledWith({
      tenantId: 'tenant-1',
      name: 'daily',
      jobType: 'report',
      kind: 'cron',
      cronExpression: '0 11 * * *',
      payload: {},
      priority: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      backoff: DEFAULT_BACKOFF_POLICY,
      nextRunAt: new Date('2026-08-26T11:00:00.000Z'),
      isEnabled: true,
    });

    await service.upsertSchedule({
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
      isEnabled: false,
    });
    expect(repository.upsertSchedule).toHaveBeenLastCalledWith({
      tenantId: 'tenant-2',
      name: 'frequent',
      jobType: 'sync',
      kind: 'interval',
      intervalSeconds: 60,
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
    const { repository, service } = createHarness();
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
      await expect(service.upsertSchedule(input)).rejects.toBeInstanceOf(InvalidScheduleError);
    await expect(service.upsertSchedule(invalid[0])).rejects.toThrow(
      'Invalid schedule: tenantId, name, and jobType are required',
    );
    await expect(service.upsertSchedule(invalid[3])).rejects.toThrow(
      'Invalid schedule: cron requires cronExpression; interval requires positive intervalSeconds',
    );
    expect(repository.upsertSchedule).not.toHaveBeenCalled();
  });

  it('routes schedule reads and state transitions with exact tenant guards', async () => {
    const { repository, service } = createHarness();

    await expect(service.getSchedule('schedule-1', 'tenant-1')).resolves.toBe(schedule);
    expect(repository.inSystem).toHaveBeenLastCalledWith(
      'jobs read tenant schedule',
      expect.any(Function),
    );
    expect(repository.getSchedule).toHaveBeenCalledWith('schedule-1', 'tenant-1');
    expect(() => service.getSchedule('schedule-1')).toThrow(
      'Invalid schedule: tenantId is required',
    );

    await service.pauseSchedule('schedule-1', 'tenant-1');
    expect(repository.inSystem).toHaveBeenLastCalledWith(
      'jobs pause tenant schedule',
      expect.any(Function),
    );
    expect(repository.setScheduleEnabled).toHaveBeenLastCalledWith('schedule-1', 'tenant-1', false);
    expect(() => service.pauseSchedule('schedule-1')).toThrow(
      'Invalid schedule: tenantId is required',
    );

    await service.resumeSchedule('schedule-1', 'tenant-1');
    expect(repository.inSystem).toHaveBeenLastCalledWith(
      'jobs resume tenant schedule',
      expect.any(Function),
    );
    expect(repository.setScheduleEnabled).toHaveBeenLastCalledWith('schedule-1', 'tenant-1', true);
    expect(() => service.resumeSchedule('schedule-1')).toThrow(
      'Invalid schedule: tenantId is required',
    );

    await service.deleteSchedule('schedule-1', 'tenant-1');
    expect(repository.inSystem).toHaveBeenLastCalledWith(
      'jobs delete tenant schedule',
      expect.any(Function),
    );
    expect(repository.deleteSchedule).toHaveBeenCalledWith('schedule-1', 'tenant-1');
    expect(() => service.deleteSchedule('schedule-1')).toThrow(
      'Invalid schedule: tenantId is required',
    );
  });
});
