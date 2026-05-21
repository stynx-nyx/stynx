import { createDbRuntimeFixture, type DbRuntimeFixture } from '../runtime/fixtures';

const expectedTables = [
  'audit.events',
  'auth.group_roles',
  'auth.groups',
  'auth.roles',
  'auth.tenancies',
  'auth.tenancy_members',
  'auth.user_groups',
  'auth.user_roles',
  'auth.users',
  'storage.files',
];

const expectedFunctions = [
  'audit.attach_dml_triggers',
  'audit.compute_event_hash',
  'audit.extract_primary_key',
  'audit.fn_log_dml',
  'audit.format_hash_timestamp',
  'audit.set_event_row_hash',
  'audit.verify_chain',
  'audit.write',
  'auth.apply_tenant',
  'auth.apply_tenant_id',
  'auth.attach_tenant_enforcement_triggers',
  'auth.create_rls_policy',
  'auth.create_tenant_enforcement_trigger',
  'auth.current_roles',
  'auth.current_tenant',
  'auth.current_user_id',
  'auth.has_role',
  'auth.set_tenant',
  'auth.set_user_context',
  'auth.touch_updated_at',
  'storage.touch_updated_at',
];

const expectedTriggers = [
  'audit.events:audit_events_set_row_hash:audit.set_event_row_hash',
  'auth.roles:trig_roles_touch:auth.touch_updated_at',
  'auth.tenancies:trig_tenancies_touch:auth.touch_updated_at',
  'auth.tenancy_members:trig_members_enforce_tenant:auth.apply_tenant',
  'auth.tenancy_members:trig_members_touch:auth.touch_updated_at',
  'auth.users:trig_users_enforce_tenant:auth.apply_tenant',
  'auth.users:trig_users_touch:auth.touch_updated_at',
  'storage.files:trig_storage_files_enforce_tenant:auth.apply_tenant',
  'storage.files:trig_storage_files_touch:storage.touch_updated_at',
];

const expectedPolicies = [
  'audit.events:tenant_scope',
  'auth.tenancies:tenant_isolation',
  'auth.tenancy_members:membership_isolation',
  'auth.tenancy_members:tenant_isolation',
  'auth.user_groups:user_groups_isolation',
  'auth.user_roles:user_roles_isolation',
  'auth.users:users_isolation',
  'storage.files:tenant_scope',
];

const expectedRlsTables = [
  'audit.events',
  'auth.tenancies',
  'auth.tenancy_members',
  'auth.user_groups',
  'auth.user_roles',
  'auth.users',
  'storage.files',
];

const expectedIndexes = [
  'audit.events:events_pkey:unique:event_id',
  'audit.events:idx_audit_events_entity:nonunique:entity,entity_id',
  'audit.events:idx_audit_events_operation:nonunique:operation',
  'audit.events:idx_audit_events_pk:nonunique:pk',
  'audit.events:idx_audit_events_tenant_time:nonunique:tenancy_id,occurred_at',
  'auth.group_roles:group_roles_pkey:unique:group_id,role_id',
  'auth.groups:groups_code_key:unique:code',
  'auth.groups:groups_pkey:unique:group_id',
  'auth.roles:roles_code_key:unique:code',
  'auth.roles:roles_pkey:unique:role_id',
  'auth.tenancies:tenancies_code_key:unique:code',
  'auth.tenancies:tenancies_pkey:unique:tenancy_id',
  'auth.tenancy_members:tenancy_members_pkey:unique:membership_id',
  'auth.tenancy_members:tenancy_members_tenancy_id_user_id_key:unique:tenancy_id,user_id',
  'auth.user_groups:user_groups_pkey:unique:user_id,group_id',
  'auth.user_roles:user_roles_pkey:unique:user_id,role_id',
  'auth.users:users_external_id_key:unique:external_id',
  'auth.users:users_pkey:unique:user_id',
  'auth.users:users_username_key:unique:username',
  'storage.files:files_object_key_key:unique:object_key',
  'storage.files:files_pkey:unique:file_id',
  'storage.files:idx_storage_files_owner:nonunique:owner_id',
  'storage.files:idx_storage_files_tenant:nonunique:tenancy_id,created_at',
];

const expectedForeignKeys = [
  'auth.group_roles:group_id->auth.groups.group_id',
  'auth.group_roles:role_id->auth.roles.role_id',
  'auth.tenancy_members:default_role->auth.roles.role_id',
  'auth.tenancy_members:tenancy_id->auth.tenancies.tenancy_id',
  'auth.tenancy_members:user_id->auth.users.user_id',
  'auth.user_groups:group_id->auth.groups.group_id',
  'auth.user_groups:user_id->auth.users.user_id',
  'auth.user_roles:role_id->auth.roles.role_id',
  'auth.user_roles:user_id->auth.users.user_id',
  'auth.users:tenancy_id->auth.tenancies.tenancy_id',
  'storage.files:owner_id->auth.users.user_id',
];

describe('db DDL object coverage ledger', () => {
  let fixture: DbRuntimeFixture;

  beforeAll(async () => {
    fixture = await createDbRuntimeFixture('stynx_db_ddl_ledger');
  });

  afterAll(async () => {
    await fixture?.dispose();
  });

  it('accounts for every first-class table and function in canonical DDL schemas', async () => {
    const tables = await fixture.client.query<{ table_name: string }>(
      `
        select namespace.nspname || '.' || cls.relname as table_name
        from pg_class cls
        join pg_namespace namespace on namespace.oid = cls.relnamespace
        where namespace.nspname in ('auth', 'audit', 'storage')
          and cls.relkind = 'r'
        order by table_name
      `,
    );
    const functions = await fixture.client.query<{ function_name: string }>(
      `
        select namespace.nspname || '.' || proc.proname as function_name
        from pg_proc proc
        join pg_namespace namespace on namespace.oid = proc.pronamespace
        where namespace.nspname in ('auth', 'audit', 'storage')
        order by function_name
      `,
    );

    expect(tables.rows.map((row) => row.table_name)).toEqual(expectedTables);
    expect(functions.rows.map((row) => row.function_name)).toEqual(expectedFunctions);
  });

  it('accounts for every DDL trigger, RLS policy, index, and foreign-key edge', async () => {
    const triggers = await fixture.client.query<{ trigger_key: string }>(
      `
        select
          table_namespace.nspname || '.' || cls.relname || ':' ||
          trigger.tgname || ':' ||
          function_namespace.nspname || '.' || proc.proname as trigger_key
        from pg_trigger trigger
        join pg_class cls on cls.oid = trigger.tgrelid
        join pg_namespace table_namespace on table_namespace.oid = cls.relnamespace
        join pg_proc proc on proc.oid = trigger.tgfoid
        join pg_namespace function_namespace on function_namespace.oid = proc.pronamespace
        where table_namespace.nspname in ('auth', 'audit', 'storage')
          and not trigger.tgisinternal
        order by trigger_key
      `,
    );
    const policies = await fixture.client.query<{ policy_key: string }>(
      `
        select namespace.nspname || '.' || cls.relname || ':' || policy.polname as policy_key
        from pg_policy policy
        join pg_class cls on cls.oid = policy.polrelid
        join pg_namespace namespace on namespace.oid = cls.relnamespace
        where namespace.nspname in ('auth', 'audit', 'storage')
        order by policy_key
      `,
    );
    const indexes = await fixture.client.query<{ index_key: string }>(
      `
        select
          namespace.nspname || '.' || table_cls.relname || ':' ||
          index_cls.relname || ':' ||
          case when idx.indisunique then 'unique' else 'nonunique' end || ':' ||
          string_agg(attr.attname, ',' order by key_pos.ord) as index_key
        from pg_index idx
        join pg_class table_cls on table_cls.oid = idx.indrelid
        join pg_namespace namespace on namespace.oid = table_cls.relnamespace
        join pg_class index_cls on index_cls.oid = idx.indexrelid
        join lateral unnest(idx.indkey) with ordinality as key_pos(attnum, ord) on true
        join pg_attribute attr on attr.attrelid = table_cls.oid and attr.attnum = key_pos.attnum
        where namespace.nspname in ('auth', 'audit', 'storage')
        group by namespace.nspname, table_cls.relname, index_cls.relname, idx.indisunique
        order by index_key
      `,
    );
    const foreignKeys = await fixture.client.query<{ fk_key: string }>(
      `
        select
          source_namespace.nspname || '.' || source_cls.relname || ':' ||
          string_agg(source_attr.attname, ',' order by source_pos.ord) || '->' ||
          target_namespace.nspname || '.' || target_cls.relname || '.' ||
          string_agg(target_attr.attname, ',' order by source_pos.ord) as fk_key
        from pg_constraint constraint_row
        join pg_class source_cls on source_cls.oid = constraint_row.conrelid
        join pg_namespace source_namespace on source_namespace.oid = source_cls.relnamespace
        join pg_class target_cls on target_cls.oid = constraint_row.confrelid
        join pg_namespace target_namespace on target_namespace.oid = target_cls.relnamespace
        join lateral unnest(constraint_row.conkey) with ordinality as source_pos(attnum, ord) on true
        join lateral unnest(constraint_row.confkey) with ordinality as target_pos(attnum, ord)
          on target_pos.ord = source_pos.ord
        join pg_attribute source_attr on source_attr.attrelid = source_cls.oid and source_attr.attnum = source_pos.attnum
        join pg_attribute target_attr on target_attr.attrelid = target_cls.oid and target_attr.attnum = target_pos.attnum
        where constraint_row.contype = 'f'
          and source_namespace.nspname in ('auth', 'audit', 'storage')
        group by source_namespace.nspname, source_cls.relname, target_namespace.nspname, target_cls.relname, constraint_row.oid
        order by fk_key
      `,
    );

    expect(triggers.rows.map((row) => row.trigger_key)).toEqual(expectedTriggers);
    expect(policies.rows.map((row) => row.policy_key)).toEqual(expectedPolicies);
    expect(indexes.rows.map((row) => row.index_key)).toEqual(expectedIndexes);
    expect(foreignKeys.rows.map((row) => row.fk_key)).toEqual(expectedForeignKeys);
  });

  it('requires RLS enablement, force-RLS, and seed-critical rows for every tenant-scoped DDL table', async () => {
    const rlsTables = await fixture.client.query<{ table_name: string }>(
      `
        select namespace.nspname || '.' || cls.relname as table_name
        from pg_class cls
        join pg_namespace namespace on namespace.oid = cls.relnamespace
        where namespace.nspname in ('auth', 'audit', 'storage')
          and cls.relkind = 'r'
          and cls.relrowsecurity
          and cls.relforcerowsecurity
        order by table_name
      `,
    );
    const seedState = await fixture.client.query<{
      tenancies: string;
      roles: string;
      groups: string;
      group_roles: string;
      users: string;
      memberships: string;
      user_roles: string;
      user_groups: string;
    }>(
      `
        select
          (select count(*) from auth.tenancies)::text as tenancies,
          (select count(*) from auth.roles)::text as roles,
          (select count(*) from auth.groups)::text as groups,
          (select count(*) from auth.group_roles)::text as group_roles,
          (select count(*) from auth.users)::text as users,
          (select count(*) from auth.tenancy_members)::text as memberships,
          (select count(*) from auth.user_roles)::text as user_roles,
          (select count(*) from auth.user_groups)::text as user_groups
      `,
    );

    expect(rlsTables.rows.map((row) => row.table_name)).toEqual(expectedRlsTables);
    expect(seedState.rows).toEqual([
      {
        tenancies: '1',
        roles: '4',
        groups: '2',
        group_roles: '2',
        users: '1',
        memberships: '1',
        user_roles: '2',
        user_groups: '1',
      },
    ]);
  });
});
