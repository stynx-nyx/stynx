#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/reference/api/docker-compose.yml"
BASE_URL="${STYNX_SMOKE_BASE_URL:-http://127.0.0.1:3000}"
POSTGRES_PORT="${STYNX_SMOKE_POSTGRES_PORT:-${STYNX_POSTGRES_PORT:-55432}}"
export STYNX_POSTGRES_PORT="$POSTGRES_PORT"
DATABASE_URL="${STYNX_SMOKE_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/postgres}"
TENANT_ID="${STYNX_SMOKE_TENANT_ID:-01978f4a-32bf-7c27-a131-fd73a9e001a1}"
EMAIL="${STYNX_SMOKE_EMAIL:-admin@sample-demo.test}"

tmp_dir="$(mktemp -d)"
cleanup() {
  docker compose -f "$COMPOSE_FILE" down -v >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

json_get() {
  node -e "const fs=require('node:fs'); const path=process.argv[1]; const key=process.argv[2]; const data=JSON.parse(fs.readFileSync(path,'utf8')); console.log(key.split('.').reduce((v,k)=>v&&v[k], data) ?? '');" "$1" "$2"
}

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local output="$4"
  shift 4
  local args=(-sS -X "$method" "$BASE_URL$path" -o "$output" -w "%{http_code}" "$@")
  if [[ -n "$body" ]]; then
    args+=(-H 'content-type: application/json' --data "$body")
  fi
  curl "${args[@]}"
}

expect_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"
  local body_file="$4"
  if [[ "$actual" != "$expected" ]]; then
    echo "[smoke][fail] $label expected $expected got $actual" >&2
    cat "$body_file" >&2 || true
    exit 1
  fi
  echo "[smoke][ok] $label"
}

wait_for_postgres() {
  for _ in $(seq 1 60); do
    if psql "$DATABASE_URL" -Atc 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "[smoke][fail] postgres did not become ready at $DATABASE_URL" >&2
  return 1
}

cd "$ROOT_DIR"

docker compose -f "$COMPOSE_FILE" down -v >/dev/null 2>&1 || true
docker compose -f "$COMPOSE_FILE" up -d --build postgres redis localstack
wait_for_postgres

pnpm --filter @stynx-nyx/cli build
node "$ROOT_DIR/packages/cli/dist/cli/src/main.js" migrate up --database-url "$DATABASE_URL"

docker compose -f "$COMPOSE_FILE" up -d --build reference-api

for _ in $(seq 1 90); do
  if curl -sf "$BASE_URL/readyz" >/dev/null; then
    break
  fi
  sleep 2
done
curl -sf "$BASE_URL/readyz" >/dev/null

login_body="$tmp_dir/login.json"
status="$(request POST /_reference/dev-login "{\"email\":\"$EMAIL\",\"tenantId\":\"$TENANT_ID\"}" "$login_body")"
expect_status 201 "$status" "log in" "$login_body"

token="$(json_get "$login_body" accessToken)"
auth=(-H "authorization: Bearer $token" -H "x-tenant-id: $TENANT_ID")

record_body="$tmp_dir/record.json"
status="$(request POST /records '{"title":"Smoke record","email":"smoke@example.test"}' "$record_body" "${auth[@]}" -H "Idempotency-Key: smoke-record")"
expect_status 201 "$status" "create record" "$record_body"
record_id="$(json_get "$record_body" id)"

upload_payload='%PDF-1.4 smoke document'
upload_checksum="$(printf '%s' "$upload_payload" | shasum -a 256 | awk '{print $1}')"
document_body="$tmp_dir/document.json"
status="$(request POST /documents "{\"collection\":\"records\",\"filename\":\"smoke.pdf\",\"mimeType\":\"application/pdf\",\"byteSize\":${#upload_payload},\"checksumSha256\":\"$upload_checksum\"}" "$document_body" "${auth[@]}" -H "Idempotency-Key: smoke-document")"
expect_status 201 "$status" "create document" "$document_body"
document_id="$(json_get "$document_body" id)"
upload_url="$(json_get "$document_body" upload.url | sed 's#http://localstack:4566#http://127.0.0.1:4566#')"
curl -sS -X PUT "$upload_url" \
  -H 'content-type: application/pdf' \
  -H "x-amz-meta-sha256: $upload_checksum" \
  -H 'x-amz-server-side-encryption: aws:kms' \
  -H 'x-amz-server-side-encryption-aws-kms-key-id: alias/stynx-local' \
  --data "$upload_payload" >/dev/null

complete_body="$tmp_dir/document-complete.json"
status="$(request POST "/documents/$document_id/complete" '{}' "$complete_body" "${auth[@]}" -H "Idempotency-Key: smoke-document-complete")"
expect_status 201 "$status" "complete upload" "$complete_body"

deleted_body="$tmp_dir/document-delete.json"
status="$(request DELETE "/documents/$document_id" '' "$deleted_body" "${auth[@]}" -H "Idempotency-Key: smoke-document-delete")"
expect_status 200 "$status" "soft-delete document" "$deleted_body"

restored_body="$tmp_dir/document-restore.json"
status="$(request POST "/documents/$document_id/restore" '{}' "$restored_body" "${auth[@]}" -H "Idempotency-Key: smoke-document-restore")"
expect_status 201 "$status" "restore document" "$restored_body"

deleted_again_body="$tmp_dir/document-delete-again.json"
status="$(request DELETE "/documents/$document_id" '' "$deleted_again_body" "${auth[@]}" -H "Idempotency-Key: smoke-document-delete-again")"
expect_status 200 "$status" "soft-delete restored document" "$deleted_again_body"

hard_body="$tmp_dir/document-hard-delete.json"
status="$(request DELETE "/documents/$document_id/hard" '' "$hard_body" "${auth[@]}" -H "Idempotency-Key: smoke-document-hard-delete")"
expect_status 200 "$status" "hard-delete document" "$hard_body"

record_delete_body="$tmp_dir/record-delete.json"
status="$(request DELETE "/records/$record_id" '' "$record_delete_body" "${auth[@]}" -H "Idempotency-Key: smoke-record-delete")"
expect_status 200 "$status" "soft-delete record" "$record_delete_body"

echo "[smoke] local journey passed"
