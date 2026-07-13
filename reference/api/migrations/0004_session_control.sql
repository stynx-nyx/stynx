CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.session_provider_anchors (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (octet_length(provider) BETWEEN 1 AND 100),
  encrypted_handle bytea,
  keyed_fingerprint bytea,
  provider_subject_key text NOT NULL CHECK (octet_length(provider_subject_key) BETWEEN 1 AND 255),
  state text NOT NULL CHECK (state IN ('active','revocation_pending','revoked','failed','unsupported','expired','unknown')),
  capabilities jsonb NOT NULL CHECK (jsonb_typeof(capabilities) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz,
  expires_at timestamptz,
  terminal_at timestamptz,
  CHECK ((encrypted_handle IS NULL) <> (keyed_fingerprint IS NULL)),
  UNIQUE (provider, provider_subject_key, keyed_fingerprint)
);

CREATE TABLE auth.session_registrations (
  sid uuid PRIMARY KEY,
  anchor_id uuid NOT NULL REFERENCES auth.session_provider_anchors(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  subject_id text NOT NULL CHECK (octet_length(subject_id) BETWEEN 1 AND 255),
  state text NOT NULL CHECK (state IN ('active','revocation_pending','revoked','failed','unsupported','expired','retired')),
  provider_label text NOT NULL CHECK (octet_length(provider_label) BETWEEN 1 AND 100),
  device_label text CHECK (octet_length(device_label) <= 255),
  client_label text CHECK (octet_length(client_label) <= 255),
  user_agent_family text CHECK (octet_length(user_agent_family) <= 100),
  device_class text CHECK (octet_length(device_class) <= 50),
  country text CHECK (octet_length(country) <= 2),
  region text CHECK (octet_length(region) <= 100),
  guarantee text NOT NULL CHECK (guarantee IN ('immediate_local','bounded_local','refresh_revoked_access_expires','provider_confirmed','none')),
  propagation_bound_seconds integer CHECK (propagation_bound_seconds BETWEEN 1 AND 30),
  effective_by timestamptz,
  access_token_expires_at timestamptz,
  blast_radius text NOT NULL DEFAULT 'tenant' CHECK (blast_radius IN ('tenant','identity')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_seen_at timestamptz,
  expires_at timestamptz,
  terminal_at timestamptz,
  CHECK (guarantee <> 'bounded_local' OR (propagation_bound_seconds IS NOT NULL AND effective_by IS NOT NULL)),
  CHECK (guarantee <> 'refresh_revoked_access_expires' OR access_token_expires_at IS NOT NULL)
);
CREATE INDEX session_registrations_subject_idx ON auth.session_registrations (tenant_id, subject_id, state, last_seen_at DESC);
CREATE UNIQUE INDEX session_registrations_sid_tenant_idx ON auth.session_registrations (tenant_id, sid);
CREATE INDEX session_registrations_terminal_idx ON auth.session_registrations (tenant_id, terminal_at);

CREATE TABLE auth.session_operations (
  operation_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('tenant','identity')),
  tenant_id uuid NOT NULL,
  actor_id text NOT NULL CHECK (octet_length(actor_id) BETWEEN 1 AND 255),
  subject_id text CHECK (subject_id IS NULL OR octet_length(subject_id) BETWEEN 1 AND 255),
  action text NOT NULL CHECK (action IN ('logout-current','revoke-one','revoke-others','revoke-all','revoke-subject','revoke-tenant')),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  state text NOT NULL CHECK (state IN ('pending','revoked','unsupported','failed')),
  guarantee text NOT NULL CHECK (guarantee IN ('immediate_local','bounded_local','refresh_revoked_access_expires','provider_confirmed','none')),
  result_json jsonb NOT NULL CHECK (jsonb_typeof(result_json) = 'object'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  lease_until timestamptz,
  completed_at timestamptz,
  terminal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, operation_id),
  UNIQUE (scope, actor_id, action, operation_id)
);
CREATE INDEX session_operations_retry_idx ON auth.session_operations (tenant_id, state, next_attempt_at);
CREATE INDEX session_operations_lease_idx ON auth.session_operations (tenant_id, lease_until);

CREATE TABLE auth.session_operation_attempts (
  tenant_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number >= 0),
  outcome text NOT NULL CHECK (outcome IN ('pending','revoked','unsupported','failed')),
  error_code text CHECK (error_code IS NULL OR octet_length(error_code) <= 100),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, operation_id, attempt_number),
  FOREIGN KEY (tenant_id, operation_id) REFERENCES auth.session_operations(tenant_id, operation_id) ON DELETE CASCADE
);

ALTER TABLE auth.session_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.session_registrations FORCE ROW LEVEL SECURITY;
CREATE POLICY session_registrations_tenant ON auth.session_registrations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE auth.session_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.session_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY session_operations_tenant ON auth.session_operations
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE auth.session_operation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.session_operation_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY session_operation_attempts_tenant ON auth.session_operation_attempts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON auth.session_provider_anchors FROM PUBLIC;
REVOKE ALL ON auth.session_registrations, auth.session_operations, auth.session_operation_attempts FROM PUBLIC;
