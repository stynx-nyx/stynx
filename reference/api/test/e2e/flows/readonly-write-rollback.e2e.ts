import { createHash } from 'node:crypto';
import { PermissionCache } from '@stynx-nyx/auth';
import { StynxPoolRegistry } from '@stynx-nyx/data';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeReferenceApiE2e,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app.js';
import { actors, tenants } from '../fixtures/seed.js';

// ADR-PERF-0001 / INV-PERF-001: functional no-write evidence only, not nominal latency evidence.
// This is the actual handler's fixed SQL target, in this suite's uniquely owned database.
const targetTenant = '00000000-0000-0000-0000-000000000000';
const settingsQuery = `select tenant_id::text, timezone, locale, settings,
  updated_at::text as updated_at
  from tenancy.tenant_settings order by tenant_id`;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

interface SettingsRow {
  tenant_id: string;
  timezone: string | null;
  locale: string | null;
  settings: Record<string, unknown>;
  updated_at: string;
}

describe('readonly probe independent full-visibility business-state proof', () => {
  let context: ReferenceApiE2eContext | undefined;

  function fixture(): ReferenceApiE2eContext {
    if (!context) throw new Error('Readonly probe fixture is not initialized');
    return context;
  }

  async function ownerSnapshot() {
    const client = await fixture().postgres.connectAsAdmin();
    try {
      await client.query('begin read only');
      await client.query('set local role stynx_owner');
      await client.query("set local timezone = 'UTC'");
      const identity = await client.query(`select current_database() as database,
        current_user as role, session_user as login,
        current_setting('transaction_read_only') as readonly,
        row_security_active('tenancy.tenant_settings'::regclass) as filtered,
        r.rolbypassrls, pg_get_userbyid(c.relowner) as table_owner
        from pg_roles r cross join pg_class c
        where r.rolname = current_user and c.oid = 'tenancy.tenant_settings'::regclass`);
      expect(identity.rows).toEqual([
        expect.objectContaining({
          database: fixture().postgres.database,
          role: 'stynx_owner',
          readonly: 'on',
          filtered: false,
          rolbypassrls: true,
          table_owner: 'stynx_owner',
        }),
      ]);
      const { rows } = await client.query<SettingsRow>(settingsQuery);
      // An independently seeded other tenant must be visible without a tenant GUC.
      expect(rows).toContainEqual(
        expect.objectContaining({
          tenant_id: tenants.tenantA,
          settings: { rollbackWitness: 'sentinel-other-tenant' },
        }),
      );
      await client.query('commit');
      return { identity: identity.rows[0], rows, sha256: digest(rows) };
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    context = await setupReferenceApiE2e({ databaseName: 'reference_readonly_rollback' });
    const client = await context.postgres.connectAsAdmin();
    try {
      await client.query('set role stynx_owner');
      await client.query(
        `insert into tenancy.tenants(id,slug,name)
        values ($1,'readonly-fixed-target','Owned readonly probe target')`,
        [targetTenant],
      );
      await client.query(
        `insert into tenancy.tenant_settings(tenant_id,timezone,locale,settings,updated_at)
        values ($1,'UTC','en','{"rollbackWitness":"sentinel-other-tenant"}',
          '2020-01-02T03:04:05.123456Z')`,
        [tenants.tenantA],
      );
      await client.query(`insert into auth.perms(key,description)
        values ('sample:probe:read','Readonly probe rollback witness') on conflict(key) do nothing`);
      await client.query(
        `insert into auth.direct_perms(membership_id,perm_id,effect)
        select $1::uuid,id,'allow' from auth.perms where key='sample:probe:read'`,
        [actors.viewerA.membershipId],
      );
    } finally {
      await client.end();
    }
    await context.app
      .get(PermissionCache)
      .publishInvalidation(`${actors.viewerA.userId}:${tenants.tenantA}`);
    const appIdentity = await context.app.get(StynxPoolRegistry).pools.app.query(`select
      current_user,session_user,rolsuper,rolbypassrls from pg_roles where rolname=current_user`);
    expect(appIdentity.rows).toEqual([
      {
        current_user: 'stynx_app',
        session_user: 'stynx_app',
        rolsuper: false,
        rolbypassrls: false,
      },
    ]);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  }, 60_000);

  it.each([false, true])(
    'refuses the real HTTP write with target row present=%s and leaves exact owner-visible state unchanged',
    async (present) => {
      // Owner setup ends before either observation and before the isolated HTTP workload.
      const client = await fixture().postgres.connectAsAdmin();
      try {
        await client.query('set role stynx_owner');
        await client.query('delete from tenancy.tenant_settings where tenant_id=$1', [
          targetTenant,
        ]);
        if (present) {
          await client.query(
            `insert into tenancy.tenant_settings(tenant_id,timezone,locale,settings,updated_at)
          values ($1,'America/Sao_Paulo','pt-BR','{"rollbackWitness":"original","nested":{"keep":7}}',
            '2001-02-03T04:05:06.789123Z')`,
            [targetTenant],
          );
        }
      } finally {
        await client.end();
      }
      const before = await ownerSnapshot();
      const target = before.rows.filter((row) => row.tenant_id === targetTenant);
      expect(target).toHaveLength(present ? 1 : 0);
      if (present) {
        expect(target[0]).toEqual({
          tenant_id: targetTenant,
          timezone: 'America/Sao_Paulo',
          locale: 'pt-BR',
          settings: { rollbackWitness: 'original', nested: { keep: 7 } },
          updated_at: '2001-02-03 04:05:06.789123+00',
        });
      }

      const started = performance.now();
      const response = await request(fixture().app.getHttpServer())
        .get('/_probes/readonly-write')
        .set('authorization', `Bearer ${fixture().tokens.viewerA}`)
        .expect(500);
      const durationMs = performance.now() - started;
      expect(response.body).toEqual({
        code: 'READONLY_VIOLATION',
        message: 'Read-only transaction cannot execute a write statement',
        context: { originalCode: '25006' },
      });
      const after = await ownerSnapshot();
      expect(after.rows).toEqual(before.rows);
      expect(after.sha256).toBe(before.sha256);
      expect(after.rows.filter((row) => row.tenant_id === targetTenant)).toEqual(target);
      console.info(
        'readonly-business-state-proof',
        JSON.stringify({
          targetTenant,
          present,
          query: settingsQuery,
          querySha256: digest(settingsQuery),
          before,
          after,
          response: response.body,
          durationMs,
          scope: 'functional rollback witness; no nominal performance verdict',
        }),
      );
    },
  );
});
