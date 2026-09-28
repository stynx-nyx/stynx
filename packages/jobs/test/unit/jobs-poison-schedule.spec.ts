import { InvalidCronExpressionError, InvalidScheduleError } from '../../src/errors';
import { JobsRepository } from '../../src/jobs.repository';

const now = new Date('2026-09-27T10:00:00.000Z');
const bad = {
  id: 'bad-schedule', tenantId: 'tenant-a', name: 'bad', jobType: 'jobs.bad',
  kind: 'cron' as const, cronExpression: 'broken', intervalSeconds: null,
  payload: {}, priority: 0, maxAttempts: 3, backoff: { baseMs: 1, maxMs: 10, multiplier: 2 },
  isEnabled: true, nextRunAt: now, lastEnqueuedAt: null, createdBy: null,
  actorId: 'actor-a', timezone: 'Mars/Olympus', createdAt: now, updatedAt: now,
};
const good = { ...bad, id: 'good-schedule', tenantId: 'tenant-b', name: 'good',
  kind: 'interval' as const, cronExpression: null, intervalSeconds: 60, actorId: 'actor-b', timezone: 'UTC' };

const cronState = vi.hoisted(() => ({
  calls: [] as Array<[string, Date, string]>,
  error: null as Error | null,
}));
vi.mock('../../src/cron', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cron')>()),
  nextCronRunAt: (expression: string, after: Date, timezone: string) => {
    cronState.calls.push([expression, after, timezone]);
    if (cronState.error) throw cronState.error;
    return new Date(after.getTime() + 60_000);
  },
}));

function harness(rows: Array<typeof bad | typeof good>, sqlFailure?: Error) {
  const committed: string[] = [];
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('from jobs.schedules')) return { rows };
    if (sqlFailure && sql.includes('insert into jobs.jobs')) throw sqlFailure;
    return { rows: [] };
  });
  const database = {
    tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => {
      const staged: string[] = [];
      const result = await fn({ query: vi.fn(async (sql: string, params?: unknown[]) => {
        const value = await query(sql, params);
        if (!sql.includes('from jobs.schedules')) staged.push(sql);
        return value;
      }) as typeof query });
      committed.push(...staged);
      return result;
    }),
  };
  return { repository: new JobsRepository(database as never), query, committed, database };
}

// CTG-0004: only the cron calculator's typed input error is an isolatable row fault.
describe('JobsRepository invalid schedule transaction boundary', () => {
  beforeEach(() => { cronState.calls = []; cronState.error = null; });

  it('isolates InvalidCronExpressionError, disables the bad row, and returns only successful rows', async () => {
    cronState.error = new InvalidCronExpressionError('broken');
    const { repository, query, committed, database } = harness([bad, good]);
    await expect(repository.materialize(2)).resolves.toEqual([good]);
    expect(database.tx).toHaveBeenCalledWith(expect.any(Function), { role: 'owner' });
    expect(cronState.calls).toEqual([['broken', now, 'Mars/Olympus']]);
    const inserts = query.mock.calls.filter(([sql]) => sql.includes('insert into jobs.jobs'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.[1]).toContain('good-schedule');
    expect(query.mock.calls.some(([sql, params]) => sql.includes('disabled_reason') &&
      (sql.includes('invalid_schedule') || params?.includes('invalid_schedule')))).toBe(true);
    expect(committed.some((sql) => sql.includes('disabled_reason'))).toBe(true);
    expect(committed.some((sql) => sql.includes('next_run_at=$2') && sql.includes('last_enqueued_at'))).toBe(true);
  });

  it('propagates InvalidScheduleError from the cron calculator and rolls back earlier work', async () => {
    const error = new InvalidScheduleError('unexpected service validation');
    cronState.error = error;
    const { repository, query, committed } = harness([good, bad]);
    let caught: unknown;
    try { await repository.materialize(2); } catch (error) { caught = error; }
    expect(caught instanceof InvalidScheduleError).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into jobs.jobs'))).toBe(true);
    expect(committed).toEqual([]);
  });

  it('propagates plain errors from the cron calculator and rolls back earlier work', async () => {
    const error = new Error('unexpected program failure');
    cronState.error = error;
    const { repository, query, committed } = harness([good, bad]);
    let caught: unknown;
    try { await repository.materialize(2); } catch (error) { caught = error; }
    expect(caught instanceof Error).toBe(true);
    expect((caught as Error).message).toBe('unexpected program failure');
    expect(query.mock.calls.some(([sql]) => sql.includes('insert into jobs.jobs'))).toBe(true);
    expect(committed).toEqual([]);
  });

  it('propagates unexpected SQL errors and rolls back the owner transaction', async () => {
    const sqlError = Object.assign(new Error('database unavailable'), { code: '08006' });
    const { repository, committed } = harness([good], sqlError);
    await expect(repository.materialize(1)).rejects.toBe(sqlError);
    expect(committed).toEqual([]);
  });
});
