import { JobsRepository } from '../../src/jobs.repository';

const now = new Date('2026-08-26T10:00:00.000Z');
const later = new Date('2026-08-26T11:00:00.000Z');
const job = {
  id: 'job-1',
  tenantId: 'tenant-1',
  scheduleId: null,
  jobType: 'email',
  payload: { message: 'hello' },
  status: 'running' as const,
  priority: 3,
  attempts: 1,
  maxAttempts: 4,
  runAt: now,
  lockedBy: 'worker-1',
  lockedUntil: later,
  startedAt: now,
  finishedAt: null,
  lastError: null,
  deadLetterReason: null,
  idempotencyKey: 'email-1',
  actorId: 'actor-1',
  createdAt: now,
  updatedAt: now,
};
const cronSchedule = {
  id: 'schedule-1',
  tenantId: 'tenant-1',
  name: 'daily',
  jobType: 'email',
  kind: 'cron' as const,
  cronExpression: '0 11 * * *',
  intervalSeconds: null,
  payload: { template: 'daily' },
  priority: 2,
  maxAttempts: 4,
  backoff: { baseMs: 10, maxMs: 100, multiplier: 2 },
  isEnabled: true,
  nextRunAt: now,
  lastEnqueuedAt: null,
  createdBy: 'actor-1',
  createdAt: now,
  updatedAt: now,
};

function createDatabase(query: ReturnType<typeof vi.fn>) {
  const trx = { query };
  return {
    trx,
    database: {
      tx: vi.fn(async (fn: (value: typeof trx) => unknown, _options?: unknown) => fn(trx)),
      withSystemContext: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      withRequestContext: vi.fn(async (_context: unknown, fn: () => unknown) => fn()),
    },
  };
}

describe('JobsRepository persistence and context contract', () => {
  it('preserves system and request context while supplying the complete handler context', async () => {
    const { database } = createDatabase(vi.fn());
    const repository = new JobsRepository(database as never);
    const handler = vi.fn(async () => undefined);

    await expect(repository.inSystem('custom reason', async () => 42)).resolves.toBe(42);
    expect(database.withSystemContext).toHaveBeenLastCalledWith(
      'custom reason',
      expect.any(Function),
    );

    await repository.executeHandler(job, handler);
    expect(database.withSystemContext).toHaveBeenLastCalledWith(
      'jobs execute email',
      expect.any(Function),
    );
    expect(database.withRequestContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', actorId: 'actor-1' },
      expect.any(Function),
    );
    expect(handler).toHaveBeenLastCalledWith(job.payload, {
      jobId: 'job-1',
      jobType: 'email',
      tenantId: 'tenant-1',
      actorId: 'actor-1',
      attempt: 1,
      maxAttempts: 4,
      scheduleId: null,
    });

    await repository.executeHandler({ ...job, actorId: null }, handler);
    expect(database.withRequestContext).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(
      job.payload,
      expect.objectContaining({ actorId: null }),
    );
  });

  it('binds exact job insert, claim, completion, failure, read, and cancellation queries', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('returning id, tenant_id')) return { rows: [job], rowCount: 1 };
      if (sql.includes('select id, tenant_id')) return { rows: [job], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const { database } = createDatabase(query);
    const repository = new JobsRepository(database as never);

    await expect(
      repository.enqueue({
        tenantId: 'tenant-1',
        jobType: 'email',
        payload: { message: 'hello' },
        runAt: now,
        priority: 3,
        maxAttempts: 4,
        idempotencyKey: 'email-1',
        actorId: 'actor-1',
      }),
    ).resolves.toBe(job);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('insert into jobs.jobs'), [
      'tenant-1',
      null,
      'email',
      '{"message":"hello"}',
      now,
      3,
      4,
      'email-1',
      'actor-1',
    ]);

    await expect(repository.claim('worker-1', 5, 30_000)).resolves.toEqual([job]);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('for update skip locked'), [
      5,
      'worker-1',
      30_000,
    ]);
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function), { role: 'owner' });

    await repository.succeed('job-1', 'worker-1');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("status='succeeded'"), [
      'job-1',
      'worker-1',
    ]);
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function), { role: 'owner' });

    await repository.fail('job-1', 'worker-1', 'x'.repeat(4_100), later);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("'dead_letter'::jobs.job_status"),
      ['job-1', 'worker-1', 'x'.repeat(4_000), later],
    );
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function), { role: 'owner' });

    await expect(repository.getJob('job-1', 'tenant-1')).resolves.toBe(job);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('from jobs.jobs where id=$1::uuid'),
      ['job-1', 'tenant-1'],
    );

    await expect(repository.cancel('job-1', 'tenant-1')).resolves.toBe(true);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("status in ('pending','running')"),
      ['job-1', 'tenant-1'],
    );
  });

  it('returns null and false for absent tenant rows', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: undefined }));
    const { database } = createDatabase(query);
    const repository = new JobsRepository(database as never);

    await expect(repository.getJob('missing', 'tenant-1')).resolves.toEqual(null);
    await expect(repository.getSchedule('missing', 'tenant-1')).resolves.toEqual(null);
    await expect(repository.cancel('missing', 'tenant-1')).resolves.toBe(false);
  });

  it('binds exact schedule upsert, read, enable, and delete inputs', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('returning id, tenant_id')) return { rows: [cronSchedule] };
      if (sql.includes('select id, tenant_id')) return { rows: [cronSchedule] };
      return { rows: [] };
    });
    const { database } = createDatabase(query);
    const repository = new JobsRepository(database as never);

    await expect(
      repository.upsertSchedule({
        tenantId: 'tenant-1',
        name: 'daily',
        jobType: 'email',
        kind: 'cron',
        cronExpression: '0 11 * * *',
        payload: { template: 'daily' },
        priority: 2,
        maxAttempts: 4,
        backoff: { baseMs: 10, maxMs: 100, multiplier: 2 },
        nextRunAt: now,
        createdBy: 'actor-1',
        isEnabled: true,
      }),
    ).resolves.toBe(cronSchedule);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('insert into jobs.schedules'), [
      'tenant-1',
      'daily',
      'email',
      'cron',
      '0 11 * * *',
      null,
      '{"template":"daily"}',
      2,
      4,
      10,
      100,
      2,
      now,
      'actor-1',
      true,
    ]);

    await expect(repository.getSchedule('schedule-1', 'tenant-1')).resolves.toBe(cronSchedule);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('from jobs.schedules where id=$1::uuid'),
      ['schedule-1', 'tenant-1'],
    );

    await repository.setScheduleEnabled('schedule-1', 'tenant-1', false);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('set is_enabled=$3'), [
      'schedule-1',
      'tenant-1',
      false,
    ]);

    await repository.deleteSchedule('schedule-1', 'tenant-1');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('delete from jobs.schedules'), [
      'schedule-1',
      'tenant-1',
    ]);
  });

  it('materializes cron and interval schedules with stable idempotency keys and next runs', async () => {
    const intervalSchedule = {
      ...cronSchedule,
      id: 'schedule-2',
      kind: 'interval' as const,
      cronExpression: null,
      intervalSeconds: 90,
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from jobs.schedules where is_enabled'))
        return { rows: [cronSchedule, intervalSchedule] };
      if (sql.includes('insert into jobs.jobs')) return { rows: [job] };
      return { rows: [] };
    });
    const { database } = createDatabase(query);
    const repository = new JobsRepository(database as never);

    await expect(repository.materialize(2)).resolves.toEqual([cronSchedule, intervalSchedule]);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('order by next_run_at asc limit $1 for update skip locked'),
      [2],
    );
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('insert into jobs.jobs'), [
      'tenant-1',
      'schedule-1',
      'email',
      '{"template":"daily"}',
      now,
      2,
      4,
      'schedule:schedule-1:2026-08-26T10:00:00.000Z',
      null,
    ]);
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('update jobs.schedules set next_run_at=$2'),
      ['schedule-1', new Date('2026-08-26T11:00:00.000Z')],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('insert into jobs.jobs'),
      expect.arrayContaining(['schedule-2', 'schedule:schedule-2:2026-08-26T10:00:00.000Z']),
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('update jobs.schedules set next_run_at=$2'),
      ['schedule-2', new Date(now.getTime() + 90_000)],
    );
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function), { role: 'owner' });
  });
});
