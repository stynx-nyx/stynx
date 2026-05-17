-- @security-definer-approved: platform-architects/STYNX-AUDIT-DML
ALTER FUNCTION audit.fn_row_change() SECURITY DEFINER;
ALTER FUNCTION audit.fn_row_change() SET search_path = audit, public, pg_catalog, pg_temp;

SELECT audit.enable_for('tenancy.tenants'::regclass);
SELECT audit.enable_for('tenancy.tenant_settings'::regclass);

SELECT audit.enable_for('auth.users'::regclass);
SELECT audit.enable_for('auth.roles'::regclass);
SELECT audit.enable_for('auth.perms'::regclass);
SELECT audit.enable_for('auth.memberships'::regclass);
SELECT audit.enable_for('auth.role_perms'::regclass);
SELECT audit.enable_for('auth.membership_roles'::regclass);
SELECT audit.enable_for('auth.direct_perms'::regclass);
SELECT audit.enable_for('auth.groups'::regclass);
SELECT audit.enable_for('auth.group_memberships'::regclass);
SELECT audit.enable_for('auth.group_roles'::regclass);
SELECT audit.enable_for('auth.sessions'::regclass);
SELECT audit.enable_for('auth.invitations'::regclass);

SELECT audit.enable_for('core.config'::regclass);
SELECT audit.enable_for('core.rate_limit_overrides'::regclass);
SELECT audit.enable_for('core.idempotency_keys'::regclass);
SELECT audit.enable_for('core.schema_migrations'::regclass);
SELECT audit.enable_for('core.softdelete_fk_registry'::regclass);
SELECT audit.enable_for('core.pii_map'::regclass);

SELECT audit.enable_for('storage.document_versions'::regclass);
SELECT audit.enable_for('storage.document_acl'::regclass);
