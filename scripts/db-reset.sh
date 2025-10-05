#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" && ($# -lt 1 || $1 != "--database-url") ]]; then
  echo "Usage: DATABASE_URL=postgres://... scripts/db-reset.sh" >&2
  echo "   or scripts/db-reset.sh --database-url postgres://user:pass@host:5432/st_core" >&2
  exit 1
fi

if [[ "${1:-}" == "--database-url" ]]; then
  DATABASE_URL="$2"
fi

run_sql() {
  local file="$1"
  echo "Applying $file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
}

run_sql db/ddl/00-extensions.sql
run_sql db/ddl/01-auth.sql
run_sql db/ddl/02-audit.sql
run_sql db/ddl/03-storage.sql
run_sql db/seed/00-base.sql

echo "Database reset complete"
