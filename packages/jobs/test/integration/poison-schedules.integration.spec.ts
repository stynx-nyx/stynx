import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { RequestContextMutator } from '@stynx-nyx/core';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { createPostgresTestDatabase } from '../../../data/test/support/postgres';
import { InvalidScheduleError, JobsService, StynxJobsModule } from '../../src';
import { JobsRepository } from '../../src/jobs.repository';

const tenantA = '31111111-1111-4111-8111-111111111111';
const tenantB = '32222222-2222-4222-8222-222222222222';
const actorA = '3aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actorB = '3bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const asApp = (url: string): string => `${url}&options=${encodeURIComponent('-c role=stynx_app')}`;

// INV-RBAC-001; CTG-0004: direct application-role writes can persist invalid cron rows.
describe('CTG-0004 poisoned schedule isolation under FORCE RLS', () => {
  it.each([
    { path: 'INSERT', invalidFirst: true },
    { path: 'UPDATE', invalidFirst: false },
  ])('isolates an app-role $path and preserves the other tenant when invalidFirst=$invalidFirst', async ({ path, invalidFirst }) => {
    const testDatabase = await createPostgresTestDatabase(`stynx_jobs_poison_${path.toLowerCase()}`);
    let moduleRef: TestingModule | undefined;
    let admin: Client | undefined;
    try {
      moduleRef = await Test.createTestingModule({
        imports: [
          StynxDataModule.forRoot({
            connections: {
              owner: { connectionString: testDatabase.connectionString('poison-owner') },
              app: { connectionString: asApp(testDatabase.connectionString('poison-app')) },
              reader: { connectionString: testDatabase.connectionString('poison-reader') },
            },
            migrations: { enabled: true },
          }),
          StynxJobsModule.forRoot({ worker: { enabled: false }, scheduler: { enabled: false } }),
        ],
      }).compile();
      await moduleRef.init();
      admin = await testDatabase.connectAsAdmin();
      const pools = moduleRef.get(StynxPoolRegistry).pools;
      const appRole = await pools.app.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(`
        select current_user, rolsuper, rolbypassrls from pg_roles where rolname=current_user
      `);
      expect(appRole.rows).toEqual([{ current_user: 'stynx_app', rolsuper: false, rolbypassrls: false }]);

      await admin.query(`insert into tenancy.tenants(id,slug,name) values
        ($1,$3,'Poison tenant A'),($2,$4,'Poison tenant B')`,
      [tenantA, tenantB, `poison-a-${path.toLowerCase()}`, `poison-b-${path.toLowerCase()}`]);
      await admin.query(`insert into auth.users(id,email) values ($1,$3),($2,$4)`,
        [actorA, actorB, `poison-a-${path.toLowerCase()}@example.test`, `poison-b-${path.toLowerCase()}@example.test`]);
      await admin.query(`insert into auth.memberships(tenant_id,user_id,is_active) values ($1,$3,true),($2,$4,true)`,
        [tenantA, tenantB, actorA, actorB]);

      const database = moduleRef.get(Database);
      const mutator = moduleRef.get(RequestContextMutator);
      const service = moduleRef.get(JobsService);
      const repository = moduleRef.get(JobsRepository);
      const inA = <T>(fn: () => Promise<T>): Promise<T> => mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenantA, actorId: actorA,
      }, fn);
      const inB = <T>(fn: () => Promise<T>): Promise<T> => mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenantB, actorId: actorB,
      }, fn);
      const badId = randomUUID();
      const goodId = randomUUID();
      const badDue = new Date(Date.now() - (invalidFirst ? 120_000 : 60_000));
      const goodDue = new Date(Date.now() - (invalidFirst ? 60_000 : 120_000));
      const badName = `poison-${path.toLowerCase()}`;

      if (path === 'INSERT') {
        await inA(() => database.tx(async (trx) => {
          const role = await trx.query<{ current_user: string }>('select current_user');
          expect(role.rows).toEqual([{ current_user: 'stynx_app' }]);
          await trx.query(`insert into jobs.schedules
            (id,tenant_id,name,job_type,kind,cron_expression,actor_id,timezone,next_run_at,is_enabled)
            values ($1,$2,$3,'jobs.poison','cron','not a cron',$4,'UTC',$5,true)`,
          [badId, tenantA, badName, actorA, badDue]);
        }));
      } else {
        await admin.query(`insert into jobs.schedules
          (id,tenant_id,name,job_type,kind,cron_expression,actor_id,timezone,next_run_at,is_enabled)
          values ($1,$2,$3,'jobs.poison','cron','0 9 * * *',$4,'UTC',$5,true)`,
        [badId, tenantA, badName, actorA, badDue]);
        await inA(() => database.tx(async (trx) => {
          const role = await trx.query<{ current_user: string }>('select current_user');
          expect(role.rows).toEqual([{ current_user: 'stynx_app' }]);
          const updated = await trx.query(`update jobs.schedules set timezone='Mars/Olympus'
            where id=$1 and tenant_id=$2`, [badId, tenantA]);
          expect(updated.rowCount).toBe(1);
        }));
      }

      await admin.query(`insert into jobs.schedules
        (id,tenant_id,name,job_type,kind,cron_expression,actor_id,timezone,next_run_at,is_enabled)
        values ($1,$2,'healthy','jobs.healthy','cron','0 9 * * *',$3,'UTC',$4,true)`,
      [goodId, tenantB, actorB, goodDue]);
      await expect(inA(() => database.tx(async (trx) => {
        await trx.query(`insert into jobs.schedules
          (tenant_id,name,job_type,kind,cron_expression,actor_id,timezone,next_run_at,is_enabled)
          values ($1,'cross-tenant','jobs.poison','cron','0 9 * * *',$2,'UTC',$3,true)`,
        [tenantB, actorB, badDue]);
      }))).rejects.toMatchObject({ code: '42501' });
      const crossTenant = await admin.query<{ count: number }>(`
        select count(*)::int as count from jobs.schedules where tenant_id=$1 and name='cross-tenant'`, [tenantB]);
      expect(crossTenant.rows).toEqual([{ count: 0 }]);

      const materialized = await repository.inSystem('jobs isolate poisoned schedule', () => repository.materialize(2));
      expect(materialized.map((row) => row.id)).toEqual([goodId]);
      expect(materialized[0]?.actorId).toBe(actorB);
      const bad = await admin.query<{
        is_enabled: boolean; disabled_reason: string | null; next_run_at: Date; last_enqueued_at: Date | null;
      }>(`select is_enabled, disabled_reason, next_run_at, last_enqueued_at from jobs.schedules where id=$1`, [badId]);
      expect(bad.rows).toEqual([{
        is_enabled: false, disabled_reason: 'invalid_schedule', next_run_at: badDue, last_enqueued_at: null,
      }]);
      const badJobs = await admin.query<{ count: number }>(`
        select count(*)::int as count from jobs.jobs where schedule_id=$1`, [badId]);
      expect(badJobs.rows).toEqual([{ count: 0 }]);
      const goodJobs = await admin.query<{ tenant_id: string; actor_id: string; count: number }>(`
        select tenant_id::text, actor_id::text, count(*)::int as count from jobs.jobs
        where schedule_id=$1 group by tenant_id,actor_id`, [goodId]);
      expect(goodJobs.rows).toEqual([{ tenant_id: tenantB, actor_id: actorB, count: 1 }]);
      const good = await admin.query<{ next_run_at: Date; last_enqueued_at: Date | null }>(`
        select next_run_at,last_enqueued_at from jobs.schedules where id=$1`, [goodId]);
      expect(good.rows[0]?.next_run_at.getTime()).toBeGreaterThan(goodDue.getTime());
      expect(good.rows[0]?.last_enqueued_at).toBeInstanceOf(Date);

      await inA(async () => {
        expect((await service.getSchedule(badId, tenantA))?.disabledReason).toBe('invalid_schedule');
        await expect(service.resumeSchedule(badId, tenantA)).rejects.toMatchObject({ code: 'SCHEDULE_INVALID' });
        await expect(service.resumeSchedule(badId, tenantA)).rejects.toBeInstanceOf(InvalidScheduleError);
        const repaired = await service.upsertSchedule({
          tenantId: tenantA, name: badName, jobType: 'jobs.poison', kind: 'interval',
          intervalSeconds: 60, actorId: actorA, timezone: 'UTC', isEnabled: true,
        });
        expect(repaired.id).toBe(badId);
        expect(repaired.disabledReason).toBeNull();
        expect(repaired.isEnabled).toBe(true);
      });
      await inB(async () => {
        expect(await service.getSchedule(badId, tenantB)).toBeNull();
        expect((await service.getSchedule(goodId, tenantB))?.disabledReason).toBeNull();
      });
      const repairedDb = await admin.query<{ disabled_reason: string | null }>(`
        select disabled_reason from jobs.schedules where id=$1`, [badId]);
      expect(repairedDb.rows).toEqual([{ disabled_reason: null }]);
      await admin.query(`update jobs.schedules set next_run_at=clock_timestamp()-interval '1 minute' where id=$1`, [badId]);
      const afterRepair = await repository.inSystem('jobs run repaired schedule', () => repository.materialize(1));
      expect(afterRepair.map((row) => row.id)).toEqual([badId]);
      const repairedJobs = await admin.query<{ count: number }>(`
        select count(*)::int as count from jobs.jobs where schedule_id=$1`, [badId]);
      expect(repairedJobs.rows).toEqual([{ count: 1 }]);
    } finally {
      await admin?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });
});
