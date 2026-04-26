create table resource_record (
  id uuid primary key,
  organization_id uuid not null,
  label text,
  deleted boolean default false,
  deleted_at timestamptz
);

create table activity_log (
  id uuid primary key,
  organization_id uuid not null,
  message text not null
);
