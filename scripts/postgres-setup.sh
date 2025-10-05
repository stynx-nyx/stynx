#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: scripts/postgres-setup.sh --database-url postgres://user:pass@host:port/dbname [--role app_user]

Creates the target database and role if they do not exist. Requires psql access with privileges.
USAGE
}

DATABASE_URL=""
ROLE_NAME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --database-url)
      DATABASE_URL="$2"; shift 2 ;;
    --role)
      ROLE_NAME="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$DATABASE_URL" ]]; then
  echo "--database-url is required" >&2
  usage
  exit 1
fi

TMP_CONN="${DATABASE_URL##*@}"
HOST_PORT="${TMP_CONN%%/*}"
DB_NAME="${DATABASE_URL##*/}"
ROLE_CONN="${DATABASE_URL#postgres://}"
ROLE_CONN="${ROLE_CONN%%@*}"
DB_USER="${ROLE_CONN%%:*}"
DB_PASS="${ROLE_CONN#*:}"
DB_PASS="${DB_PASS%%@*}"
HOST="${HOST_PORT%%:*}"
PORT="${HOST_PORT##*:}"

export PGPASSWORD="$DB_PASS"

psql "postgresql://${DB_USER}@${HOST}:${PORT}/postgres" <<SQL
CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};
SQL

if [[ -n "$ROLE_NAME" ]]; then
  psql "postgresql://${DB_USER}@${HOST}:${PORT}/${DB_NAME}" <<SQL
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE_NAME}') THEN
    CREATE ROLE ${ROLE_NAME} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END$$;
GRANT CONNECT ON DATABASE ${DB_NAME} TO ${ROLE_NAME};
SQL
fi

echo "Database ${DB_NAME} ready"
