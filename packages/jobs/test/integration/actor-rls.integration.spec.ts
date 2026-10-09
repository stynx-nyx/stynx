import { Test, type TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { RequestContext, RequestContextMutator, SystemContext, SystemContextRequiredError } from '@stynx-nyx/core';
import { Database, StynxDataModule, StynxPoolRegistry } from '@stynx-nyx/data';
import { createPostgresTestDatabase } from '../../../data/test/support/postgres';
import { JobActorAssignmentDeniedError, JobActorMembershipError, JobTenantMismatchError, JobsRegistry, JobsService, JobsWorker, ScheduleActorRequiredError, StynxJobsModule } from '../../src';
import { JobsRepository } from '../../src/jobs.repository';

const tenant1 = '11111111-1111-4111-8111-111111111111';
const tenant2 = '22222222-2222-4222-8222-222222222222';
const caller = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const technicalActor = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const foreignActor = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// Both helper URL forms already contain a query string; the socket form is not WHATWG-URL parseable.
const asRole = (connectionString: string, role: 'stynx_app' | 'stynx_reader'): string =>
  `${connectionString}&options=${encodeURIComponent(`-c role=${role}`)}`;

describe('UPS-JOB-01/02 actorful execution under real PostgreSQL RLS', () => {
  it('materializes the schedule actor and writes only through the tenant application role', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_jobs_actor');
    let moduleRef: TestingModule | undefined;
    let admin: Client | undefined;
    try {
      moduleRef = await Test.createTestingModule({
        imports: [
          StynxDataModule.forRoot({
            connections: {
              owner: { connectionString: testDatabase.connectionString('jobs-owner') },
              app: { connectionString: testDatabase.appConnectionString('jobs-app') },
              reader: { connectionString: asRole(testDatabase.connectionString('jobs-reader'), 'stynx_reader') },
            },
            migrations: { enabled: true },
          }),
          StynxJobsModule.forRoot({
            worker: { enabled: false, workerId: 'jobs-rls-worker' },
            scheduler: { enabled: false },
            authorizeTechnicalActor: async ({ tenantId, callerActorId, technicalActorId, permission }) =>
              tenantId === tenant1 && callerActorId === caller && technicalActorId === technicalActor
                && permission === 'jobs.assignTechnicalActor',
          }),
        ],
      }).compile();
      await moduleRef.init();
      admin = await testDatabase.connectAsAdmin();
      const pools = moduleRef.get(StynxPoolRegistry).pools;

      // A connection-start role precondition prevents an admin pool from masquerading as RLS evidence.
      const appRole = await pools.app.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(`
        select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user
      `);
      expect(appRole.rows).toEqual([{ current_user: 'stynx_app', rolsuper: false, rolbypassrls: false }]);
      const readerRole = await pools.reader.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(`
        select current_user, rolsuper, rolbypassrls from pg_roles where rolname = current_user
      `);
      expect(readerRole.rows).toEqual([{ current_user: 'stynx_reader', rolsuper: false, rolbypassrls: false }]);

      await admin.query(`insert into tenancy.tenants(id,slug,name) values
        ($1,'jobs-rls-tenant-1','Jobs RLS Tenant 1'),($2,'jobs-rls-tenant-2','Jobs RLS Tenant 2')`, [tenant1, tenant2]);
      await admin.query(`insert into auth.users(id,email) values
        ($1,'jobs-caller@example.test'),($2,'jobs-technical@example.test'),($3,'jobs-foreign@example.test')`,
      [caller, technicalActor, foreignActor]);
      await admin.query(`insert into auth.memberships(tenant_id,user_id,is_active) values
        ($1,$3,true),($1,$4,true),($2,$5,true)`, [tenant1, tenant2, caller, technicalActor, foreignActor]);
      await admin.query(`create table jobs.actor_rls_proof (
        id uuid primary key, tenant_id uuid not null, actor_id uuid not null
      )`);
      await admin.query(`alter table jobs.actor_rls_proof enable row level security`);
      await admin.query(`alter table jobs.actor_rls_proof force row level security`);
      await admin.query(`create policy actor_rls_proof_tenant on jobs.actor_rls_proof
        using (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)
        with check (tenant_id = nullif(current_setting('app.tenant_id', true),'')::uuid)`);
      await admin.query(`grant select, insert on jobs.actor_rls_proof to stynx_app`);
      await admin.query(`grant select on jobs.actor_rls_proof to stynx_reader`);
      await admin.query(`insert into jobs.actor_rls_proof(id,tenant_id,actor_id) values ($1,$2,$3)`,
        [randomUUID(), tenant2, foreignActor]);

      const database = moduleRef.get(Database);
      const mutator = moduleRef.get(RequestContextMutator);
      const system = moduleRef.get(SystemContext);
      const service = moduleRef.get(JobsService);
      const repository = moduleRef.get(JobsRepository);
      const worker = moduleRef.get(JobsWorker);
      const registry = moduleRef.get(JobsRegistry);
      const proofId = randomUUID();
      const handler = vi.fn(async (_payload: Record<string, unknown>, context: { tenantId: string | null; actorId: string | null }) => {
        expect(context.tenantId).toBe(tenant1);
        expect(context.actorId).toBe(technicalActor);
        expect(() => system.current()).toThrow(SystemContextRequiredError);
        await expect(database.tx(async () => undefined, { role: 'owner' })).rejects.toBeInstanceOf(SystemContextRequiredError);
        await database.tx(async (trx) => {
          const state = await trx.query<{ current_user: string; tenant: string; actor: string }>(`
            select current_user, current_setting('app.tenant_id') as tenant,
                   current_setting('app.actor_id') as actor
          `);
          expect(state.rows).toEqual([{ current_user: 'stynx_app', tenant: tenant1, actor: technicalActor }]);
          await trx.query(`insert into jobs.actor_rls_proof(id,tenant_id,actor_id)
            values ($1,$2,current_setting('app.actor_id')::uuid)`, [proofId, tenant1]);
          const foreign = await trx.query(`select id from jobs.actor_rls_proof where tenant_id=$1`, [tenant2]);
          expect(foreign.rows).toEqual([]);
        });
        await expect(database.tx(async (trx) => {
          await trx.query(`insert into jobs.actor_rls_proof(id,tenant_id,actor_id)
            values ($1,$2,current_setting('app.actor_id')::uuid)`, [randomUUID(), tenant2]);
        })).rejects.toMatchObject({ code: '42501' });
      });
      registry.register('jobs.actor-proof', handler);

      // Caller/input mismatch is rejected by JobsService before it opens a database transaction.
      await mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenant1, actorId: caller,
      }, async () => {
        const txSpy = vi.spyOn(database, 'tx');
        await expect(service.getJob(randomUUID(), tenant2)).rejects.toBeInstanceOf(JobTenantMismatchError);
        expect(txSpy).not.toHaveBeenCalled();
        txSpy.mockRestore();
      });

      const schedule = await mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenant1, actorId: caller,
      }, () => service.upsertSchedule({
        tenantId: tenant1, name: 'actor-proof', jobType: 'jobs.actor-proof', kind: 'interval',
        intervalSeconds: 60, actorId: technicalActor, timezone: 'UTC',
      }));
      expect(schedule.actorId).toBe(technicalActor);
      expect(schedule.timezone).toBe('UTC');

      // Exercise the complete caller-facing port through the role-separated app pool.
      let tenant1JobId = '';
      await mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenant1, actorId: caller,
      }, async () => {
        const oneShot = await service.enqueue({ tenantId: tenant1, jobType: 'jobs.actor-proof' });
        tenant1JobId = oneShot.id;
        expect(oneShot.actorId).toBe(caller);
        expect((await service.getJob(oneShot.id, tenant1))?.id).toBe(oneShot.id);
        await expect(service.cancel(oneShot.id, tenant1)).resolves.toBe(true);
        const forCrud = await service.upsertSchedule({
          tenantId: tenant1, name: 'caller-crud', jobType: 'jobs.actor-proof', kind: 'interval',
          intervalSeconds: 60, actorId: caller,
        });
        expect((await service.getSchedule(forCrud.id, tenant1))?.id).toBe(forCrud.id);
        await service.pauseSchedule(forCrud.id, tenant1);
        expect((await service.getSchedule(forCrud.id, tenant1))?.isEnabled).toBe(false);
        await service.resumeSchedule(forCrud.id, tenant1);
        expect((await service.getSchedule(forCrud.id, tenant1))?.isEnabled).toBe(true);
        await service.deleteSchedule(forCrud.id, tenant1);
        await expect(service.getSchedule(forCrud.id, tenant1)).resolves.toEqual(null);
      });

      // A valid tenant-2 caller can access the port but cannot read or cancel tenant-1 rows.
      await mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenant2, actorId: foreignActor,
      }, async () => {
        await expect(service.getJob(tenant1JobId, tenant2)).resolves.toEqual(null);
        await expect(service.cancel(tenant1JobId, tenant2)).resolves.toBe(false);
        await expect(service.getSchedule(schedule.id, tenant2)).resolves.toEqual(null);
      });

      const deniedService = new JobsService(repository, moduleRef.get(RequestContext), {
        authorizeTechnicalActor: async () => false,
      });
      const callbacklessService = new JobsService(repository, moduleRef.get(RequestContext), {});
      await mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenant1, actorId: caller,
      }, async () => {
        const rejectedInput = {
          tenantId: tenant1, jobType: 'jobs.callback-denial', actorId: technicalActor,
          idempotencyKey: 'callback-denied',
        };
        await expect(deniedService.enqueue(rejectedInput)).rejects.toBeInstanceOf(JobActorAssignmentDeniedError);
        await expect(callbacklessService.enqueue({
          ...rejectedInput, jobType: 'jobs.callback-missing', idempotencyKey: 'callback-missing',
        })).rejects.toBeInstanceOf(JobActorAssignmentDeniedError);
      });
      const deniedRows = await admin.query<{ count: number }>(`
        select count(*)::int as count from jobs.jobs
        where tenant_id=$1 and job_type in ('jobs.callback-denial','jobs.callback-missing')`, [tenant1]);
      expect(deniedRows.rows).toEqual([{ count: 0 }]);

      await admin.query(`update jobs.schedules set next_run_at=clock_timestamp()-interval '1 minute' where id=$1`, [schedule.id]);
      const due = await repository.inSystem('jobs materialize actor proof', () => repository.materialize(1));
      expect(due).toHaveLength(1);
      expect(due[0]?.actorId).toBe(technicalActor);
      const persisted = await admin.query<{ tenant_id: string; actor_id: string }>(`
        select tenant_id::text, actor_id::text from jobs.jobs where schedule_id=$1`, [schedule.id]);
      expect(persisted.rows).toEqual([{ tenant_id: tenant1, actor_id: technicalActor }]);

      await expect(worker.tick()).resolves.toBe(1);
      expect(handler).toHaveBeenCalledTimes(1);
      const proof = await admin.query<{ tenant_id: string; actor_id: string }>(`
        select tenant_id::text, actor_id::text from jobs.actor_rls_proof where id=$1`, [proofId]);
      expect(proof.rows).toEqual([{ tenant_id: tenant1, actor_id: technicalActor }]);
      await mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenant1, actorId: caller,
      }, async () => {
        const readerProof = await database.tx(async (trx) =>
          (await trx.query<{ tenant_id: string; actor_id: string }>(`
            select tenant_id::text, actor_id::text from jobs.actor_rls_proof where id=$1`, [proofId])).rows,
        { role: 'reader', readonly: true });
        expect(readerProof).toEqual([{ tenant_id: tenant1, actor_id: technicalActor }]);
      });
      const completed = await admin.query<{ status: string }>(`
        select status::text from jobs.jobs where schedule_id=$1`, [schedule.id]);
      expect(completed.rows).toEqual([{ status: 'succeeded' }]);

      await mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenant1, actorId: caller,
      }, async () => {
        await expect(service.enqueue({ tenantId: tenant1, jobType: 'jobs.actor-proof', actorId: foreignActor }))
          .rejects.toBeInstanceOf(JobActorMembershipError);
      });

      const actorlessScheduleId = randomUUID();
      await admin.query(`insert into jobs.schedules
        (id,tenant_id,name,job_type,kind,interval_seconds,next_run_at,actor_id,is_enabled)
        values ($1,$2,'legacy-resume','jobs.actor-proof','interval',60,clock_timestamp(),null,false)`,
      [actorlessScheduleId, tenant1]);
      await mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenant1, actorId: caller,
      }, async () => {
        await expect(service.resumeSchedule(actorlessScheduleId, tenant1))
          .rejects.toBeInstanceOf(ScheduleActorRequiredError);
        const restored = await service.upsertSchedule({
          tenantId: tenant1, name: 'legacy-resume', jobType: 'jobs.actor-proof', kind: 'interval',
          intervalSeconds: 60, actorId: technicalActor, timezone: 'UTC', isEnabled: true,
        });
        expect(restored.id).toBe(actorlessScheduleId);
        expect(restored.actorId).toBe(technicalActor);
        expect(restored.isEnabled).toBe(true);
      });

      // Membership revocation after materialization invalidates the persisted actor at execution.
      await admin.query(`update jobs.schedules set next_run_at=clock_timestamp()-interval '1 minute' where id=$1`, [schedule.id]);
      await repository.inSystem('jobs materialize revoked actor proof', () => repository.materialize(1));
      const revokedJobId = await admin.query<{ id: string }>(`
        select id::text from jobs.jobs where schedule_id=$1 and status='pending'`, [schedule.id]);
      expect(revokedJobId.rows).toHaveLength(1);
      await admin.query(`update auth.memberships set is_active=false where tenant_id=$1 and user_id=$2`,
        [tenant1, technicalActor]);
      await mutator.runWithRequestContext({
        requestId: randomUUID(), startedAt: new Date(), tenantId: tenant1, actorId: caller,
      }, async () => {
        await expect(service.enqueue({ tenantId: tenant1, jobType: 'jobs.actor-proof', actorId: technicalActor }))
          .rejects.toBeInstanceOf(JobActorMembershipError);
      });
      await expect(worker.tick()).resolves.toBe(1);
      expect(handler).toHaveBeenCalledTimes(1);
      const revoked = await admin.query<{ status: string; dead_letter_reason: string; locked_by: string | null; locked_until: Date | null }>(`
        select status::text, dead_letter_reason, locked_by, locked_until from jobs.jobs
        where id=$1`, [revokedJobId.rows[0]!.id]);
      expect(revoked.rows).toEqual([{
        status: 'dead_letter', dead_letter_reason: 'inactive_actor_membership',
        locked_by: null, locked_until: null,
      }]);

      // 0019 leaves one-shot jobs nullable so the worker must dispose of historical actorless rows.
      const actorlessId = randomUUID();
      await admin.query(`insert into jobs.jobs(id,tenant_id,job_type,run_at,actor_id)
        values ($1,$2,'jobs.unregistered-actorless',clock_timestamp()-interval '1 minute',null)`, [actorlessId, tenant1]);
      const registryLookup = vi.spyOn(registry, 'get');
      await expect(worker.tick()).resolves.toBe(1);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(registryLookup).not.toHaveBeenCalled();
      const actorless = await admin.query<{ status: string; dead_letter_reason: string; locked_by: string | null; locked_until: Date | null }>(`
        select status::text, dead_letter_reason, locked_by, locked_until from jobs.jobs where id=$1`, [actorlessId]);
      expect(actorless.rows).toEqual([{
        status: 'dead_letter', dead_letter_reason: 'missing_actor', locked_by: null, locked_until: null,
      }]);
      await expect(worker.tick()).resolves.toBe(0);
    } finally {
      await admin?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });
});
