import { bindQueryContext, executeGuardedQueryRows, executeTypedQuery, QueryRowValidationError, type TypedQuery } from '@stynx-nyx/data';
import type { z } from 'zod';
import { JobsRepository } from '../../src/jobs.repository.js';
import { ScheduleActorRequiredError } from '../../src/errors.js';

const now = new Date('2026-08-26T10:00:00.000Z');
const later = new Date('2026-08-26T11:00:00.000Z');
const job = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
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
  actorId: '33333333-3333-4333-8333-333333333333',
  createdAt: now,
  updatedAt: now,
};
const cronSchedule = {
  id: '44444444-4444-4444-8444-444444444444',
  tenantId: '22222222-2222-4222-8222-222222222222',
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
  disabledReason: null,
  nextRunAt: now,
  lastEnqueuedAt: null,
  createdBy: '33333333-3333-4333-8333-333333333333',
  actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  timezone: 'UTC',
  createdAt: now,
  updatedAt: now,
};

function createDatabase(query: ReturnType<typeof vi.fn>) {
  // Keep the original SQL spy and execute the real checked boundary. This
  // narrow test port does not claim to be a complete live Transaction.
  const client = bindQueryContext({ query: async (text, values) => query(text, values) });
  const trx = {
    query,
    run<Q extends TypedQuery>(statement: Q, params: z.input<Q['params']>) {
      return executeTypedQuery(client, statement, params);
    },
    runGuarded<P extends z.ZodTuple, S extends z.ZodObject, Row>(
      statement: TypedQuery<P, S, 'many'>,
      params: z.input<P>,
      guard: (value: unknown) => value is Row,
    ) {
      return executeGuardedQueryRows(client, statement, params, guard);
    },
  };
  return {
    trx,
    database: {
      tx: vi.fn(async (fn: (value: typeof trx) => unknown, _options?: unknown) => fn(trx)),
      withSystemContext: vi.fn(async (_reason: string, fn: () => unknown) => fn()),
      withRequestContext: vi.fn(async (_context: unknown, fn: () => unknown) => fn()),
    },
  };
}

describe('JobsRepository original result identity', () => {
  it('preserves opaque payload, backoff, timestamps, own prototype-named keys and row extensions', async () => {
    const nested = { optional: undefined, date: new Date(Number.NaN), bytes: Buffer.from('opaque') };
    const payload: Record<string, unknown> = { nested };
    Object.defineProperty(payload, '__proto__', { value: nested, enumerable: true });
    const backoff = Object.freeze({ ...cronSchedule.backoff });
    const jobResult = Object.freeze({ ...job, payload, extra: nested });
    const scheduleResult = Object.freeze({ ...cronSchedule, payload, backoff, extra: nested });
    const query = vi.fn(async (text: string) => ({ rows: text.includes('jobs.schedules') ? [scheduleResult] : [jobResult] }));
    const { database } = createDatabase(query);
    const repository = new JobsRepository(database as never);
    const foundJob = await repository.getJob(job.id, job.tenantId);
    const foundSchedule = await repository.getSchedule(cronSchedule.id, cronSchedule.tenantId);
    expect(foundJob).toBe(jobResult);
    expect(foundSchedule).toBe(scheduleResult);
    expect(foundJob?.payload).toBe(payload);
    expect(foundJob?.runAt).toBe(now);
    expect(foundSchedule?.backoff).toBe(backoff);
    expect(foundSchedule?.payload).toBe(payload);
    expect(foundSchedule?.nextRunAt).toBe(now);
    expect(payload.nested).toBe(nested);
    expect(Object.getOwnPropertyDescriptor(payload, '__proto__')?.value).toBe(nested);
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
    expect(jobResult.extra).toBe(nested);
    expect(scheduleResult.extra).toBe(nested);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it.each([new Date(Number.NaN), 'infinity', Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('keeps accepted raw timestamp %s without normalization on read', async (runAt) => {
    const row = { ...job, runAt };
    const query = vi.fn(async () => ({ rows: [row] }));
    const { database } = createDatabase(query);
    const result = await new JobsRepository(database as never).getJob(job.id, job.tenantId);
    expect(result).toBe(row);
    expect(result?.runAt).toBe(runAt);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([0, Number.NaN, false, { secret: 'bad-time' }])('rejects malformed raw timestamp %s as a redacted checked row failure', async (runAt) => {
    const query = vi.fn(async () => ({ rows: [{ ...job, runAt }] }));
    const { database } = createDatabase(query);
    const error: unknown = await new JobsRepository(database as never).getJob(job.id, job.tenantId).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(JSON.stringify(error)).not.toContain('bad-time');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...cronSchedule, disabledReason: 42 },
    { ...cronSchedule, backoff: { ...cronSchedule.backoff, multiplier: 'secret-multiplier' } },
    { ...cronSchedule, payload: [] },
  ])('checks the full schedule population before exposing any result', async (invalid) => {
    const query = vi.fn(async () => ({ rows: [cronSchedule, invalid] }));
    const { database } = createDatabase(query);
    const error: unknown = await new JobsRepository(database as never).materialize(2).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({ rowIndex: 1 });
    expect(JSON.stringify(error)).not.toContain('secret-multiplier');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('insert into jobs.jobs'), expect.anything());
  });
});

describe('JobsRepository persistence and context contract', () => {
  it('keeps handlers in the persisted tenant and actor request context', async () => {
    const { database } = createDatabase(vi.fn(async () => ({ rows: [{ '?column?': 1 }], rowCount: 1 })));
    const repository = new JobsRepository(database as never);
    const handler = vi.fn(async () => undefined);

    await expect(repository.inSystem('custom reason', async () => 42)).resolves.toBe(42);
    expect(database.withSystemContext).toHaveBeenLastCalledWith(
      'custom reason',
      expect.any(Function),
    );

    await expect(repository.executeHandler(job, handler)).resolves.toEqual({ status: 'executed' });
    expect(database.withSystemContext).toHaveBeenCalledTimes(1);
    expect(database.withRequestContext).toHaveBeenCalledWith(
      { tenantId: '22222222-2222-4222-8222-222222222222', actorId: '33333333-3333-4333-8333-333333333333' },
      expect.any(Function),
    );
    expect(handler).toHaveBeenLastCalledWith(job.payload, {
      jobId: '11111111-1111-4111-8111-111111111111',
      jobType: 'email',
      tenantId: '22222222-2222-4222-8222-222222222222',
      actorId: '33333333-3333-4333-8333-333333333333',
      attempt: 1,
      maxAttempts: 4,
      scheduleId: null,
    });

    await expect(repository.executeHandler({ ...job, actorId: null }, handler)).resolves.toEqual({
      status: 'not_executable', reason: 'missing_actor',
    });
    expect(database.withRequestContext).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
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
        tenantId: '22222222-2222-4222-8222-222222222222',
        jobType: 'email',
        payload: { message: 'hello' },
        runAt: now,
        priority: 3,
        maxAttempts: 4,
        idempotencyKey: 'email-1',
        actorId: '33333333-3333-4333-8333-333333333333',
      }),
    ).resolves.toBe(job);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('insert into jobs.jobs'), [
      '22222222-2222-4222-8222-222222222222',
      null,
      'email',
      '{"message":"hello"}',
      now,
      3,
      4,
      'email-1',
      '33333333-3333-4333-8333-333333333333',
    ]);

    const claimed = repository.claim('worker-1', 5, 30_000);
    await expect(claimed).resolves.toEqual([job]);
    expect((await claimed)[0]).toBe(job);
    expect(Object.isFrozen(await claimed)).toBe(false);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('for update skip locked'), [
      5,
      'worker-1',
      30_000,
    ]);
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function), { role: 'owner' });

    await repository.succeed('11111111-1111-4111-8111-111111111111', 'worker-1');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("status='succeeded'"), [
      '11111111-1111-4111-8111-111111111111',
      'worker-1',
    ]);
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function), { role: 'owner' });

    await repository.fail('11111111-1111-4111-8111-111111111111', 'worker-1', 'x'.repeat(4_100), later);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("'dead_letter'::jobs.job_status"),
      ['11111111-1111-4111-8111-111111111111', 'worker-1', 'x'.repeat(4_000), later],
    );
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function), { role: 'owner' });

    await expect(repository.getJob('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')).resolves.toBe(job);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('from jobs.jobs where id=$1::uuid'),
      ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    );

    await expect(repository.cancel('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')).resolves.toBe(true);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("status in ('pending','running')"),
      ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    );
  });

  it('returns null and false for absent tenant rows', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: undefined }));
    const { database } = createDatabase(query);
    const repository = new JobsRepository(database as never);

    await expect(repository.getJob('66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222')).resolves.toEqual(null);
    await expect(repository.getSchedule('66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222')).resolves.toEqual(null);
    await expect(repository.cancel('66666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222')).resolves.toBe(false);
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
        tenantId: '22222222-2222-4222-8222-222222222222',
        name: 'daily',
        jobType: 'email',
        kind: 'cron',
        cronExpression: '0 11 * * *',
        payload: { template: 'daily' },
        priority: 2,
        maxAttempts: 4,
        backoff: { baseMs: 10, maxMs: 100, multiplier: 2 },
        nextRunAt: now,
        createdBy: '33333333-3333-4333-8333-333333333333',
        actorId: cronSchedule.actorId,
        timezone: 'UTC',
        isEnabled: true,
      }),
    ).resolves.toBe(cronSchedule);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('insert into jobs.schedules'), [
      '22222222-2222-4222-8222-222222222222',
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
      '33333333-3333-4333-8333-333333333333',
      cronSchedule.actorId,
      'UTC',
      true,
    ]);

    await expect(repository.getSchedule('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222')).resolves.toBe(cronSchedule);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('from jobs.schedules where id=$1::uuid'),
      ['44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222'],
    );

    await repository.setScheduleEnabled('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', false);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('set is_enabled=$3'), [
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
      false,
    ]);

    await repository.deleteSchedule('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222');
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining('delete from jobs.schedules'), [
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('materializes cron and interval schedules with stable idempotency keys and next runs', async () => {
    const intervalSchedule = {
      ...cronSchedule,
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'interval' as const,
      cronExpression: null,
      intervalSeconds: 90,
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from jobs.schedules') && sql.includes('actor_id is not null'))
        return { rows: [cronSchedule, intervalSchedule] };
      if (sql.includes('insert into jobs.jobs')) return { rows: [job] };
      return { rows: [] };
    });
    const { database } = createDatabase(query);
    const repository = new JobsRepository(database as never);

    const materialized = repository.materialize(2);
    await expect(materialized).resolves.toEqual([cronSchedule, intervalSchedule]);
    expect((await materialized)[0]).toBe(cronSchedule);
    expect((await materialized)[1]).toBe(intervalSchedule);
    expect(Object.isFrozen(await materialized)).toBe(false);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('order by next_run_at asc limit $1 for update skip locked'),
      [2],
    );
    expect(query.mock.calls[0]?.[0]).toContain('actor_id is not null');
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('insert into jobs.jobs'), [
      '22222222-2222-4222-8222-222222222222',
      '44444444-4444-4444-8444-444444444444',
      'email',
      '{"template":"daily"}',
      now,
      2,
      4,
      'schedule:44444444-4444-4444-8444-444444444444:2026-08-26T10:00:00.000Z',
      cronSchedule.actorId,
    ]);
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('update jobs.schedules set next_run_at=$2'),
      ['44444444-4444-4444-8444-444444444444', new Date('2026-08-26T11:00:00.000Z')],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('insert into jobs.jobs'),
      expect.arrayContaining(['55555555-5555-4555-8555-555555555555', 'schedule:55555555-5555-4555-8555-555555555555:2026-08-26T10:00:00.000Z']),
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('update jobs.schedules set next_run_at=$2'),
      ['55555555-5555-4555-8555-555555555555', new Date(now.getTime() + 90_000)],
    );
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function), { role: 'owner' });
  });

  it('checks active tenant membership through app SQL before actor execution', async () => {
    const query = vi.fn(async () => ({ rows: [{ '?column?': 1 }], rowCount: 1 }));
    const { database } = createDatabase(query);
    const repository = new JobsRepository(database as never);
    await expect(repository.isActiveTenantMember('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')).resolves.toBe(true);
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function));
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('from auth.memberships'), ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'],
    );
    const sql = query.mock.lastCall?.[0] as string;
    expect(sql).toContain('tenant_id');
    expect(sql).toContain('user_id');
    expect(sql).toContain('is_active');
  });

  it('dead-letters non-executable jobs directly and forbids resuming actorless schedules', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('from jobs.schedules')) return { rows: [{ ...cronSchedule, actorId: null }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const { database } = createDatabase(query);
    const repository = new JobsRepository(database as never);
    await repository.deadLetter('11111111-1111-4111-8111-111111111111', 'worker-1', 'missing_actor');
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("status='dead_letter'"), ['11111111-1111-4111-8111-111111111111', 'worker-1', 'missing_actor'],
    );
    expect(database.tx).toHaveBeenLastCalledWith(expect.any(Function), { role: 'owner' });
    expect(query.mock.lastCall?.[0]).toContain('locked_by=null');
    expect(query.mock.lastCall?.[0]).toContain('locked_until=null');

    await expect(repository.setScheduleEnabled('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', true))
      .rejects.toBeInstanceOf(ScheduleActorRequiredError);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('set is_enabled=true'), [
      '44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', true,
    ]);
  });
});
