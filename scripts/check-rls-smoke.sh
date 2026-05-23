#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTH_DDL="$ROOT_DIR/database/ddl/01-auth.sql"
AUDIT_DDL="$ROOT_DIR/database/ddl/02-audit.sql"
STORAGE_DDL="$ROOT_DIR/database/ddl/03-storage.sql"
MISSING=0

assert_pattern() {
  local file="$1"
  local pattern="$2"
  local label="$3"

  if command -v rg >/dev/null 2>&1; then
    rg --multiline --pcre2 -q "$pattern" "$file" && return 0
  elif command -v perl >/dev/null 2>&1; then
    perl -0e '
      my ($pattern, $file) = @ARGV;
      open my $fh, "<", $file or die "$file: $!";
      local $/;
      my $content = <$fh>;
      exit($content =~ /$pattern/s ? 0 : 1);
    ' "$pattern" "$file" && return 0
  else
    echo "[RLS][error] ripgrep (rg) or perl is required for multiline pattern checks"
    exit 1
  fi

  echo "[RLS][missing] $label ($file)"
  MISSING=1
}

assert_pattern "$AUTH_DDL" "CREATE OR REPLACE FUNCTION auth\\.create_tenant_enforcement_trigger" "auth.create_tenant_enforcement_trigger helper"
assert_pattern "$AUTH_DDL" "CREATE OR REPLACE FUNCTION auth\\.attach_tenant_enforcement_triggers" "auth.attach_tenant_enforcement_triggers helper"
assert_pattern "$AUTH_DDL" "CREATE OR REPLACE FUNCTION auth\\.create_rls_policy" "auth.create_rls_policy helper"

assert_pattern "$AUTH_DDL" "auth\\.create_tenant_enforcement_trigger\\(\\s*'auth'\\s*,\\s*'tenancy_members'" "tenant trigger wired for auth.tenancy_members"
assert_pattern "$AUTH_DDL" "auth\\.create_tenant_enforcement_trigger\\(\\s*'auth'\\s*,\\s*'users'" "tenant trigger wired for auth.users"
assert_pattern "$STORAGE_DDL" "auth\\.create_tenant_enforcement_trigger\\(\\s*'storage'\\s*,\\s*'files'" "tenant trigger wired for storage.files"

assert_pattern "$AUTH_DDL" "auth\\.create_rls_policy\\(\\s*'auth'\\s*,\\s*'tenancies'" "RLS helper wired for auth.tenancies"
assert_pattern "$AUTH_DDL" "auth\\.create_rls_policy\\(\\s*'auth'\\s*,\\s*'tenancy_members'" "RLS helper wired for auth.tenancy_members"
assert_pattern "$STORAGE_DDL" "auth\\.create_rls_policy\\(\\s*'storage'\\s*,\\s*'files'" "RLS helper wired for storage.files"

assert_pattern "$AUDIT_DDL" "CREATE POLICY tenant_scope ON audit\\.events" "explicit audit.events tenant policy"
assert_pattern "$AUDIT_DDL" "tenancy_id IS NULL" "audit.events policy keeps global events visibility"

DB_URL="${STYNX_DATABASE_URL:-${DATABASE_URL:-}}"
if command -v psql >/dev/null 2>&1 && [ -n "$DB_URL" ]; then
  echo "[RLS] running optional live checks via psql"

  exists_create_rls_policy="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atqc "
    select exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'auth'
        and p.proname = 'create_rls_policy'
    );
  ")"

  exists_storage_policy="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atqc "
    select exists (
      select 1
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'files'
        and policyname = 'tenant_scope'
    );
  ")"

  if [ "$exists_create_rls_policy" != "t" ]; then
    echo "[RLS][missing] auth.create_rls_policy not found in connected database"
    MISSING=1
  fi

  if [ "$exists_storage_policy" != "t" ]; then
    echo "[RLS][missing] storage.files tenant_scope policy not found in connected database"
    MISSING=1
  fi
fi

if [ "$MISSING" -ne 0 ]; then
  echo "[RLS] smoke check failed"
  exit 1
fi

echo "[RLS] smoke check passed"
