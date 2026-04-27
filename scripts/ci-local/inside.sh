#!/usr/bin/env bash
set -euo pipefail

job="${1:-${CI_LOCAL_JOB:-browser}}"
workspace="${WORKSPACE:-/workspace}"
source_dir="${CI_LOCAL_SOURCE_DIR:-}"
artifact_dir="${CI_LOCAL_ARTIFACT_DIR:-reports/ci-local/$(date -u +%Y%m%dT%H%M%SZ)-${job}}"
reference_compose_file="apps/reference-api/docker-compose.yml"
postgres_name="stynx-ci-local-postgres"
workspace_installed=0
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$workspace/.cache/ms-playwright}"

log() {
  printf '\n[%s] %s\n' "$(date -u +%H:%M:%SZ)" "$*"
}

git_head_value() {
  git rev-parse HEAD 2>/dev/null || printf '%s' "${CI_LOCAL_GIT_HEAD:-}"
}

git_status_value() {
  local count
  if count="$(git status --short 2>/dev/null | wc -l | tr -d ' ')"; then
    printf '%s' "$count"
  else
    printf '%s' "${CI_LOCAL_GIT_STATUS_COUNT:-}"
  fi
}

run() {
  log "$*"
  "$@"
}

root_turbo_run() {
  local task="$1"
  shift
  run pnpm exec turbo run "$task" --concurrency="${CI_LOCAL_TURBO_CONCURRENCY:-3}" "$@"
}

prepare_workspace() {
  if [[ -z "$source_dir" || "$source_dir" == "$workspace" ]]; then
    return 0
  fi

  log "Syncing clean workspace from $source_dir"
  mkdir -p "$workspace"
  rsync -a --delete \
    --exclude='.git/' \
    --exclude='.pnpm-store/' \
    --exclude='node_modules/' \
    --exclude='**/node_modules/' \
    --exclude='.cache/' \
    --exclude='dist/' \
    --exclude='**/dist/' \
    --exclude='build/' \
    --exclude='**/build/' \
    --exclude='coverage/' \
    --exclude='**/coverage/' \
    --exclude='reports/' \
    --exclude='**/reports/' \
    --exclude='.turbo/' \
    --exclude='**/.turbo/' \
    --exclude='*.log' \
    "$source_dir"/ "$workspace"/

  find "$workspace" -type d -name node_modules -prune -exec rm -rf {} +
}

copy_artifact() {
  local src="$1"
  local dest="$2"
  local target="$artifact_dir/$dest"

  if [[ ! -e "$src" ]]; then
    return 0
  fi

  rm -rf "$target"
  mkdir -p "$(dirname -- "$target")"
  cp -a "$src" "$target"
  log "Collected $src -> $target"
}

check_workspace_space() {
  local min_free_kb="${CI_LOCAL_MIN_FREE_KB:-6291456}"
  local available_kb
  available_kb="$(df -Pk "$workspace" | awk 'NR == 2 { print $4 }')"

  if [[ -z "$available_kb" ]]; then
    return 0
  fi

  if (( available_kb < min_free_kb )); then
    df -h "$workspace" >&2 || true
    printf '\nLocal CI needs more free space in Docker before installing dependencies.\n' >&2
    printf 'Available: %s KiB; required: %s KiB.\n' "$available_kb" "$min_free_kb" >&2
    printf 'Increase Docker Desktop disk size or prune unused Docker build cache/images, then retry.\n' >&2
    printf 'Override with CI_LOCAL_MIN_FREE_KB only when you intentionally accept the risk.\n' >&2
    return 1
  fi
}

write_metadata() {
  {
    printf 'job=%s\n' "$job"
    printf 'utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'workspace=%s\n' "$workspace"
    printf 'source_dir=%s\n' "${source_dir:-}"
    printf 'artifact_host_dir=%s\n' "${CI_LOCAL_ARTIFACT_HOST_DIR:-}"
    printf 'platform=%s\n' "${CI_LOCAL_PLATFORM:-unknown}"
    printf 'git_head=%s\n' "$(git_head_value)"
    printf 'git_status=%s\n' "$(git_status_value)"
    printf 'node=%s\n' "$(node --version 2>/dev/null || true)"
    printf 'pnpm=%s\n' "$(pnpm --version 2>/dev/null || true)"
    printf 'docker=%s\n' "$(docker --version 2>/dev/null || true)"
    printf 'docker_compose=%s\n' "$(docker compose version 2>/dev/null || true)"
    printf 'chrome=%s\n' "$(google-chrome-stable --version 2>/dev/null || true)"
    printf 'turbo_concurrency=%s\n' "${CI_LOCAL_TURBO_CONCURRENCY:-3}"
    printf 'uname=%s\n' "$(uname -a)"
  } > "$artifact_dir/metadata.txt"
}

install_workspace_once() {
  if [[ "$workspace_installed" -eq 1 ]]; then
    return 0
  fi

  check_workspace_space
  run pnpm config set store-dir "$workspace/.pnpm-store"
  run pnpm install --frozen-lockfile
  workspace_installed=1
}

ensure_dockerd() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  log "Starting Docker daemon inside local CI container"
  mkdir -p /var/run /var/lib/docker
  rm -f /var/run/docker.pid
  dockerd --host=unix:///var/run/docker.sock > "$artifact_dir/dockerd.log" 2>&1 &
  local dockerd_pid=$!

  local i
  for i in $(seq 1 90); do
    if docker info >/dev/null 2>&1; then
      log "Docker daemon is ready"
      return 0
    fi

    if ! kill -0 "$dockerd_pid" >/dev/null 2>&1; then
      break
    fi

    sleep 1
  done

  printf 'Docker daemon did not become ready.\n' >&2
  tail -200 "$artifact_dir/dockerd.log" >&2 || true
  return 1
}

wait_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-120}"
  local delay="${4:-2}"
  local i

  for i in $(seq 1 "$attempts"); do
    if curl -sf "$url" >/dev/null; then
      log "$label is ready"
      return 0
    fi
    sleep "$delay"
  done

  printf 'Timed out waiting for %s at %s\n' "$label" "$url" >&2
  curl -v "$url" >&2 || true
  return 1
}

reference_compose() {
  docker compose -f "$reference_compose_file" "$@"
}

collect_reference_artifacts() {
  mkdir -p "$artifact_dir/reference-web"
  reference_compose ps > "$artifact_dir/reference-web/compose-ps.txt" 2>&1 || true
  reference_compose logs --no-color --timestamps > "$artifact_dir/reference-web/compose.log" 2>&1 || true
  copy_artifact apps/reference-web/test-results reference-web/test-results
  copy_artifact apps/reference-web/playwright-report reference-web/playwright-report
}

cleanup_reference_stack() {
  collect_reference_artifacts
  reference_compose down -v --remove-orphans > "$artifact_dir/reference-web/compose-down.log" 2>&1 || true
}

ensure_docs_chrome() {
  local chrome_path=""

  if command -v google-chrome-stable >/dev/null 2>&1; then
    chrome_path="$(command -v google-chrome-stable)"
  elif command -v google-chrome >/dev/null 2>&1; then
    chrome_path="$(command -v google-chrome)"
  fi

  if [[ -z "$chrome_path" ]]; then
    log "Chrome stable is unavailable; installing Playwright Chromium for local docs preflight"
    install_workspace_once
    run pnpm --filter @stynx/reference-web exec playwright install --with-deps chromium
    chrome_path="$(pnpm --filter @stynx/reference-web exec node -e "const { chromium } = require('@playwright/test'); console.log(chromium.executablePath())")"
  fi

  if [[ ! -x "$chrome_path" ]]; then
    printf 'No executable browser found for docs Lighthouse run: %s\n' "$chrome_path" >&2
    return 1
  fi

  export CHROME_PATH="$chrome_path"
  export GOOGLE_CHROME_BIN="$chrome_path"
  export LHCI_CHROME_PATH="$chrome_path"
  log "Using docs browser: $chrome_path"
}

job_install() {
  install_workspace_once
}

job_lint() {
  install_workspace_once
  root_turbo_run lint
  run pnpm lint:deadcode
  run pnpm lint:deps
  run pnpm lint:cycles

  log "Reject unresolved adopt permission sentinels"
  if rg -n "TODO_PERMISSION" apps packages packages-web tools infra/cdk/bin infra/cdk/lib infra/cdk/test; then
    printf 'Unresolved TODO_PERMISSION sentinel found in source surfaces\n' >&2
    return 1
  fi
}

job_typecheck() {
  install_workspace_once
  root_turbo_run typecheck
}

job_unit() {
  local status=0
  install_workspace_once
  run pnpm test || status=$?
  return "$status"
}

job_integration() {
  local status=0
  install_workspace_once
  ensure_dockerd

  docker rm -f "$postgres_name" >/dev/null 2>&1 || true
  run docker run \
    --detach \
    --name "$postgres_name" \
    --env POSTGRES_DB=stynx \
    --env POSTGRES_USER=stynx \
    --env POSTGRES_PASSWORD=stynx \
    --publish 5432:5432 \
    postgres:16-alpine

  local i
  for i in $(seq 1 60); do
    if pg_isready -h 127.0.0.1 -p 5432 -U stynx -d stynx >/dev/null 2>&1; then
      break
    fi
    if [[ "$i" -eq 60 ]]; then
      printf 'Timed out waiting for local PostgreSQL service.\n' >&2
      status=1
    fi
    sleep 1
  done

  export DATABASE_URL="postgresql://stynx:stynx@localhost:5432/stynx"
  export STYNX_DATABASE_URL="$DATABASE_URL"

  if [[ "$status" -eq 0 ]]; then
    run pnpm --filter @stynx/cli build || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    run node packages/cli/dist/cli/src/main.js migrate up --database-url "$DATABASE_URL" || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    run pnpm db:verify || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    run bash scripts/db-reset.sh --database-url "$DATABASE_URL" || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    run pnpm check:rls-smoke || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    run pnpm test:int || status=$?
  fi

  docker logs "$postgres_name" > "$artifact_dir/integration-postgres.log" 2>&1 || true
  docker rm -f "$postgres_name" >/dev/null 2>&1 || true
  return "$status"
}

job_build() {
  install_workspace_once
  root_turbo_run build
}

job_doctor() {
  install_workspace_once
  run pnpm doctor
}

job_reference_web_e2e() {
  local status=0
  install_workspace_once
  ensure_dockerd
  cleanup_reference_stack

  run pnpm --filter @stynx/reference-web exec playwright install --with-deps chromium || status=$?
  if [[ "$status" -eq 0 ]]; then
    run reference_compose up -d --build || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    wait_http "http://127.0.0.1:3000/healthz" "reference API healthz" 120 2 || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    wait_http "http://127.0.0.1:3000/readyz" "reference API readyz" 120 2 || status=$?
  fi
  if [[ "$status" -eq 0 ]]; then
    run env CI=true pnpm --filter @stynx/reference-web test:e2e || status=$?
  fi

  cleanup_reference_stack
  return "$status"
}

job_docs() {
  local status=0
  install_workspace_once
  ensure_docs_chrome
  run pnpm --filter docs build:ci || status=$?
  copy_artifact docs/build/lighthouse docs/lighthouse
  return "$status"
}

job_browser() {
  job_reference_web_e2e
  job_docs
}

job_all_linux() {
  job_install
  job_lint
  job_typecheck
  job_unit
  job_integration
  job_build
  job_doctor
  job_reference_web_e2e
  job_docs
}

main() {
  mkdir -p "$artifact_dir"
  prepare_workspace
  cd "$workspace"
  git config --global --add safe.directory "$workspace" >/dev/null 2>&1 || true
  export CI=true
  export FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true
  export DOCKER_BUILDKIT=1
  export COMPOSE_DOCKER_CLI_BUILD=1

  write_metadata

  case "$job" in
    install) job_install ;;
    lint) job_lint ;;
    typecheck) job_typecheck ;;
    unit) job_unit ;;
    integration) job_integration ;;
    build) job_build ;;
    doctor) job_doctor ;;
    reference-web-e2e) job_reference_web_e2e ;;
    docs) job_docs ;;
    browser) job_browser ;;
    all-linux) job_all_linux ;;
    *)
      printf 'Unknown local CI job: %s\n' "$job" >&2
      return 64
      ;;
  esac
}

main "$@"
