#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/ci-local/run.sh <job>

Jobs:
  install             Run the CI dependency install step.
  stynx               Run the framework CI lane locally.
  stynx-release       Run the framework release-prep lane locally.
  reference-apps      Run the reference app consumer lane locally.
  lint                Run the STYNX lint and dependency gates.
  typecheck           Run the STYNX typecheck gates.
  unit                Run unit tests with coverage.
  integration         Run PostgreSQL-backed integration gates.
  build               Run the STYNX build commands.
  doctor              Run pnpm doctor.
  reference-web-e2e   Run the browser E2E gate from reference-apps.yml.
  docs                Run docs build:ci plus Lighthouse.
  browser             Run reference-web-e2e and docs.
  all-linux           Run all local Linux CI jobs in order.

Environment:
  CI_LOCAL_IMAGE      Docker image tag to build/use. Default: stynx-ci-local:node24-pnpm9
  CI_LOCAL_PLATFORM   Docker platform. Default: linux/amd64
  CI_LOCAL_ARTIFACT_DIR
                      Repo-relative artifact directory. Default: reports/ci-local/<timestamp>-<job>
  CI_LOCAL_CPUS       Optional docker run --cpus value.
  CI_LOCAL_MEMORY     Optional docker run --memory value.
  CI_LOCAL_TURBO_CONCURRENCY
                      Optional Turbo task concurrency. Default: 3.
  CI_LOCAL_MIN_FREE_KB
                      Optional minimum free space check inside the runner. Default: 6291456.
  CI_LOCAL_WORKSPACE_VOLUME
                      Optional Docker volume for the runner workspace. Default: stynx-ci-local-workspace-<platform>.
  CI_LOCAL_DOCKER_VOLUME
                      Optional Docker volume for nested Docker state. Default: stynx-ci-local-docker-<platform>.
USAGE
}

main() {
  local job="${1:-browser}"
  if [[ "$job" == "-h" || "$job" == "--help" || "$job" == "help" ]]; then
    usage
    return 0
  fi

  case "$job" in
    install|stynx|stynx-release|reference-apps|lint|typecheck|unit|integration|build|doctor|reference-web-e2e|docs|browser|all-linux) ;;
    *)
      usage >&2
      printf '\nUnknown local CI job: %s\n' "$job" >&2
      return 64
      ;;
  esac

  local script_dir repo_root image platform artifact_dir node_major pnpm_version platform_slug
  local workspace_volume docker_volume
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  if repo_root="$(git -C "$script_dir/../.." rev-parse --show-toplevel 2>/dev/null)"; then
    :
  else
    repo_root="$(cd "$script_dir/../.." && pwd)"
  fi
  cd "$repo_root"

  if ! command -v docker >/dev/null 2>&1; then
    printf 'Docker is required for local CI preflight.\n' >&2
    return 127
  fi

  if ! docker info >/dev/null 2>&1; then
    printf 'Docker is installed, but the Docker daemon is not reachable.\n' >&2
    return 1
  fi

  image="${CI_LOCAL_IMAGE:-stynx-ci-local:node24-pnpm9}"
  platform="${CI_LOCAL_PLATFORM:-linux/amd64}"
  platform_slug="${platform//\//-}"
  platform_slug="${platform_slug//[^a-zA-Z0-9_.-]/-}"
  workspace_volume="${CI_LOCAL_WORKSPACE_VOLUME:-stynx-ci-local-workspace-$platform_slug}"
  docker_volume="${CI_LOCAL_DOCKER_VOLUME:-stynx-ci-local-docker-$platform_slug}"
  node_major="${NODE_MAJOR:-24}"
  pnpm_version="${PNPM_VERSION:-9.15.0}"
  artifact_dir="${CI_LOCAL_ARTIFACT_DIR:-reports/ci-local/$(date -u +%Y%m%dT%H%M%SZ)-${job}}"

  case "$artifact_dir" in
    /*)
      printf 'CI_LOCAL_ARTIFACT_DIR must be repo-relative, got: %s\n' "$artifact_dir" >&2
      return 64
      ;;
  esac

  mkdir -p "$artifact_dir"

  local artifact_abs git_head git_status_count
  artifact_abs="$repo_root/$artifact_dir"
  git_head="$(git rev-parse HEAD 2>/dev/null || true)"
  git_status_count="$(git status --short 2>/dev/null | wc -l | tr -d ' ')"

  printf 'Building local CI image %s for %s...\n' "$image" "$platform"
  docker build \
    --platform "$platform" \
    --build-arg "NODE_MAJOR=$node_major" \
    --build-arg "PNPM_VERSION=$pnpm_version" \
    -f tools/ci-local/Dockerfile \
    -t "$image" \
    .

  local -a run_args
  run_args=(
    --privileged
    --user root
    --platform "$platform"
    --name "stynx-ci-local-$$"
    --workdir /workspace
    --volume "$repo_root:/workspace-src:ro"
    --volume "$artifact_abs:/ci-artifacts"
    --volume "$workspace_volume:/workspace"
    --volume "$docker_volume:/var/lib/docker"
    --env CI=true
    --env FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true
    --env CI_LOCAL_SOURCE_DIR=/workspace-src
    --env WORKSPACE=/workspace
    --env CI_LOCAL_ARTIFACT_DIR=/ci-artifacts
    --env "CI_LOCAL_ARTIFACT_HOST_DIR=$artifact_dir"
    --env "CI_LOCAL_GIT_HEAD=$git_head"
    --env "CI_LOCAL_GIT_STATUS_COUNT=$git_status_count"
    --env "CI_LOCAL_JOB=$job"
    --env "CI_LOCAL_PLATFORM=$platform"
    --env "CI_LOCAL_WORKSPACE_VOLUME=$workspace_volume"
    --env "CI_LOCAL_DOCKER_VOLUME=$docker_volume"
    --env "CI_LOCAL_TURBO_CONCURRENCY=${CI_LOCAL_TURBO_CONCURRENCY:-3}"
    --env "PNPM_VERSION=$pnpm_version"
  )

  if [[ -n "${CI_LOCAL_CPUS:-}" ]]; then
    run_args+=(--cpus "$CI_LOCAL_CPUS")
  fi

  if [[ -n "${CI_LOCAL_MEMORY:-}" ]]; then
    run_args+=(--memory "$CI_LOCAL_MEMORY")
  fi

  if [[ -n "${CI_LOCAL_MIN_FREE_KB:-}" ]]; then
    run_args+=(--env "CI_LOCAL_MIN_FREE_KB=$CI_LOCAL_MIN_FREE_KB")
  fi

  printf 'Running local CI job %s...\n' "$job"
  local container_name logs_pid inspect_output running exit_code
  container_name="stynx-ci-local-$$"

  cleanup_container() {
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  }

  trap cleanup_container EXIT
  cleanup_container
  docker create "${run_args[@]}" "$image" "$job" >/dev/null
  docker start "$container_name" >/dev/null
  docker logs -f "$container_name" &
  logs_pid="$!"

  while :; do
    inspect_output="$(docker inspect --format '{{.State.Running}} {{.State.ExitCode}}' "$container_name")"
    running="${inspect_output%% *}"
    exit_code="${inspect_output##* }"

    if [[ "$running" != "true" ]]; then
      break
    fi

    sleep 2
  done

  wait "$logs_pid" || true
  cleanup_container
  trap - EXIT

  if [[ "$exit_code" -ne 0 ]]; then
    return "$exit_code"
  fi

  printf '\nLocal CI artifacts: %s/%s\n' "$repo_root" "$artifact_dir"
}

main "$@"
