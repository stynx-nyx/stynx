create schema if not exists profile;
create table if not exists profile.subject_preferences (
  tenant_id uuid not null references tenancy.tenants(id) on delete cascade,
  subject_id varchar(255) not null,
  display_name varchar(120),
  avatar_document_id varchar(255),
  preference_overrides jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, subject_id),
  check (octet_length(subject_id) between 1 and 255),
  check (octet_length(preference_overrides::text) <= 16384)
);
alter table profile.subject_preferences enable row level security;
alter table profile.subject_preferences force row level security;
drop policy if exists subject_preferences_tenant_select on profile.subject_preferences;
create policy subject_preferences_tenant_select on profile.subject_preferences for select using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
drop policy if exists subject_preferences_tenant_insert on profile.subject_preferences;
create policy subject_preferences_tenant_insert on profile.subject_preferences for insert with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
drop policy if exists subject_preferences_tenant_update on profile.subject_preferences;
create policy subject_preferences_tenant_update on profile.subject_preferences for update using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
drop policy if exists subject_preferences_tenant_delete on profile.subject_preferences;
create policy subject_preferences_tenant_delete on profile.subject_preferences for delete using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant usage on schema profile to stynx_app, stynx_reader;
grant select, insert, update, delete on profile.subject_preferences to stynx_app;
grant select on profile.subject_preferences to stynx_reader;
