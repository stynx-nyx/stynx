import { createDbRuntimeFixture, type DbRuntimeFixture } from '../runtime/fixtures';

describe('db invariant: audit attach completeness', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_inv_audit_attach');
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('proves audit.attach_dml_triggers attaches audit_log_dml to an explicit scratch table', async () => {
    await fixture.client.query('drop schema if exists w3_audit_attach cascade');
    await fixture.client.query('create schema w3_audit_attach');
    await fixture.client.query(
      `
        create table w3_audit_attach.items (
          id uuid primary key,
          tenancy_id uuid not null,
          label text not null
        )
      `,
    );

    await fixture.client.query(`select audit.attach_dml_triggers('w3_audit_attach', 'items')`);

    const triggers = await fixture.client.query<{
      trigger_name: string;
      trigger_enabled: string;
      function_schema: string;
      function_name: string;
    }>(
      `
        select
          trigger.tgname::text as trigger_name,
          trigger.tgenabled::text as trigger_enabled,
          function_namespace.nspname::text as function_schema,
          proc.proname::text as function_name
        from pg_trigger trigger
        join pg_class cls on cls.oid = trigger.tgrelid
        join pg_namespace table_namespace on table_namespace.oid = cls.relnamespace
        join pg_proc proc on proc.oid = trigger.tgfoid
        join pg_namespace function_namespace on function_namespace.oid = proc.pronamespace
        where table_namespace.nspname = 'w3_audit_attach'
          and cls.relname = 'items'
          and not trigger.tgisinternal
        order by trigger.tgname
      `,
    );

    expect(triggers.rows).toEqual([
      {
        trigger_name: 'audit_log_dml',
        trigger_enabled: 'O',
        function_schema: 'audit',
        function_name: 'fn_log_dml',
      },
    ]);
  });

  it('keeps current DDL explicit: no built-in app table has audit_log_dml pre-attached', async () => {
    const appAuditTriggers = await fixture.client.query<{
      table_name: string;
      trigger_name: string;
    }>(
      `
        select
          table_namespace.nspname || '.' || cls.relname as table_name,
          trigger.tgname::text as trigger_name
        from pg_trigger trigger
        join pg_class cls on cls.oid = trigger.tgrelid
        join pg_namespace table_namespace on table_namespace.oid = cls.relnamespace
        where table_namespace.nspname in ('auth', 'audit', 'storage')
          and trigger.tgname = 'audit_log_dml'
          and not trigger.tgisinternal
        order by table_namespace.nspname, cls.relname, trigger.tgname
      `,
    );

    expect(appAuditTriggers.rows).toEqual([]);
  });
});
