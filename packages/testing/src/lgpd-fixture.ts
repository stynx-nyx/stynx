import { randomUUID } from 'node:crypto';
import type { StynxPgClient } from '@stynx/data';
import type { TestSqlStep } from './types';

export interface LgpdFixtureIds {
  tenantId: string;
  actorId: string;
  subjectUserId: string;
  liveSubjectId: string;
  archivedSubjectId: string;
  liveAttachmentId: string;
  archivedAttachmentId: string;
}

export const LGPD_FIXTURE_MIGRATIONS: TestSqlStep[] = [
  `
    create schema if not exists privacy_fixture;
    grant usage, create on schema privacy_fixture to stynx_owner;
    grant usage on schema privacy_fixture to stynx_app;
    grant usage on schema privacy_fixture to stynx_reader;

    select data.create_soft_deletable_table($$
      CREATE TABLE privacy_fixture.subjects (
        id uuid primary key,
        tenant_id uuid not null references tenancy.tenants(id),
        subject_user_id uuid not null,
        email text,
        phone text,
        note text,
        profile_json jsonb,
        created_at timestamptz not null default clock_timestamp()
      )
    $$);

    select data.create_soft_deletable_table($$
      CREATE TABLE privacy_fixture.attachments (
        id uuid primary key,
        tenant_id uuid not null references tenancy.tenants(id),
        subject_user_id uuid not null,
        blob_key text,
        created_at timestamptz not null default clock_timestamp()
      )
    $$);

    select audit.enable_for('privacy_fixture.subjects'::regclass);
    select audit.enable_for('archive.privacy_fixture_subjects'::regclass);
    select audit.enable_for('privacy_fixture.attachments'::regclass);
    select audit.enable_for('archive.privacy_fixture_attachments'::regclass);
  `,
];

export function lgpdFixturePiiMapYaml(): string {
  return [
    'rules:',
    '  - tableSchema: privacy_fixture',
    '    tableName: subjects',
    '    columnName: email',
    '    strategy: nullify',
    '    category: contact',
    '    subjectColumn: subject_user_id',
    '    tenantColumn: tenant_id',
    '  - tableSchema: privacy_fixture',
    '    tableName: subjects',
    '    columnName: phone',
    '    strategy: hash_with_salt',
    '    category: contact',
    '    subjectColumn: subject_user_id',
    '    tenantColumn: tenant_id',
    '  - tableSchema: privacy_fixture',
    '    tableName: subjects',
    '    columnName: note',
    '    strategy: tombstone',
    '    category: note',
    '    subjectColumn: subject_user_id',
    '    tenantColumn: tenant_id',
    '    retention:',
    '      timestampColumn: created_at',
    '      olderThanDays: 30',
    '      target: archive',
    '      reason: nightly fixture cleanup',
    '  - tableSchema: privacy_fixture',
    '    tableName: subjects',
    '    columnName: profile_json',
    '    strategy: nullify',
    '    category: profile',
    '    subjectColumn: subject_user_id',
    '    tenantColumn: tenant_id',
    '  - tableSchema: privacy_fixture',
    '    tableName: attachments',
    '    columnName: blob_key',
    '    strategy: delete_row',
    '    category: storage',
    '    subjectColumn: subject_user_id',
    '    tenantColumn: tenant_id',
  ].join('\n');
}

export async function seedLgpdFixture(client: StynxPgClient, input: Partial<LgpdFixtureIds> = {}): Promise<LgpdFixtureIds> {
  const ids: LgpdFixtureIds = {
    tenantId: input.tenantId ?? randomUUID(),
    actorId: input.actorId ?? randomUUID(),
    subjectUserId: input.subjectUserId ?? randomUUID(),
    liveSubjectId: input.liveSubjectId ?? randomUUID(),
    archivedSubjectId: input.archivedSubjectId ?? randomUUID(),
    liveAttachmentId: input.liveAttachmentId ?? randomUUID(),
    archivedAttachmentId: input.archivedAttachmentId ?? randomUUID(),
  };

  await client.query(
    `
      insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
      values ($1::uuid, $2, 'LGPD Fixture', true, clock_timestamp(), clock_timestamp())
    `,
    [ids.tenantId, `lgpd-${ids.tenantId.slice(0, 8)}`],
  );
  await client.query(
    `
      insert into auth.users (id, email, external_subject, created_at, updated_at)
      values
        ($1::uuid, 'subject@example.com', $1::text, clock_timestamp(), clock_timestamp()),
        ($2::uuid, 'actor@example.com', $2::text, clock_timestamp(), clock_timestamp())
    `,
    [ids.subjectUserId, ids.actorId],
  );
  await client.query(
    `
      insert into core.pii_map (table_schema, table_name, column_name, strategy, category, notes)
      values
        ('privacy_fixture', 'subjects', 'email', 'nullify', 'contact', 'fixture email'),
        ('privacy_fixture', 'subjects', 'phone', 'hash_with_salt', 'contact', 'fixture phone'),
        ('privacy_fixture', 'subjects', 'note', 'tombstone', 'note', 'fixture note'),
        ('privacy_fixture', 'subjects', 'profile_json', 'nullify', 'profile', 'fixture json profile'),
        ('privacy_fixture', 'attachments', 'blob_key', 'delete_row', 'storage', 'fixture blob reference')
    `,
  );
  await client.query(`select set_config('app.tenant_id', $1, false)`, [ids.tenantId]);
  await client.query(`select set_config('app.actor_id', $1, false)`, [ids.actorId]);
  await client.query(
    `
      insert into privacy_fixture.subjects (id, tenant_id, subject_user_id, email, phone, note, profile_json, created_at)
      values
        ($1::uuid, $2::uuid, $3::uuid, 'live@example.com', '5511999999999', 'keep me private', '{"name":"Live Subject"}'::jsonb, clock_timestamp()),
        ($4::uuid, $2::uuid, $3::uuid, 'old@example.com', '5511888888888', 'old archive', '{"name":"Archived Subject"}'::jsonb, clock_timestamp() - interval '60 days')
    `,
    [ids.liveSubjectId, ids.tenantId, ids.subjectUserId, ids.archivedSubjectId],
  );
  await client.query(
    `
      insert into privacy_fixture.attachments (id, tenant_id, subject_user_id, blob_key, created_at)
      values
        ($1::uuid, $2::uuid, $3::uuid, 's3://fixture/live', clock_timestamp()),
        ($4::uuid, $2::uuid, $3::uuid, 's3://fixture/archive', clock_timestamp() - interval '60 days')
    `,
    [ids.liveAttachmentId, ids.tenantId, ids.subjectUserId, ids.archivedAttachmentId],
  );
  await client.query(`select set_config('app.archive_move', 'in_progress', false)`);
  await client.query(`select set_config('app.archive_reason', 'soft_delete', false)`);
  await client.query(
    `
      insert into archive.privacy_fixture_subjects (
        id, tenant_id, subject_user_id, email, phone, note, profile_json, created_at, archived_at, deleted_at, deleted_by
      )
      select id, tenant_id, subject_user_id, email, phone, note, profile_json, created_at, clock_timestamp(), clock_timestamp(), $1::uuid
      from privacy_fixture.subjects
      where id = $2::uuid
    `,
    [ids.actorId, ids.archivedSubjectId],
  );
  await client.query(`delete from privacy_fixture.subjects where id = $1::uuid`, [ids.archivedSubjectId]);
  await client.query(
    `
      insert into archive.privacy_fixture_attachments (
        id, tenant_id, subject_user_id, blob_key, created_at, archived_at, deleted_at, deleted_by
      )
      select id, tenant_id, subject_user_id, blob_key, created_at, clock_timestamp(), clock_timestamp(), $1::uuid
      from privacy_fixture.attachments
      where id = $2::uuid
    `,
    [ids.actorId, ids.archivedAttachmentId],
  );
  await client.query(`delete from privacy_fixture.attachments where id = $1::uuid`, [ids.archivedAttachmentId]);

  return ids;
}
