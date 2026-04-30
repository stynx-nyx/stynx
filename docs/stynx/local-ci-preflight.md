# Local CI Preflight

This repository keeps GitHub Actions as the compatibility target while exposing
local commands that produce comparable debugging evidence. The local pass is
useful before opening or updating a pull request, but the GitHub workflow run
remains the merge/release authority.

## Purpose

Use the local preflight runner before pushing changes that affect STYNX
framework CI, reference app validation, docs, or Linux behavior. It runs the CI
commands inside an Ubuntu container with Node 24, pnpm 9, Docker-in-Docker,
PostgreSQL client tools, Playwright, and Chrome/Lighthouse support.

The default platform is `linux/amd64` because that is closest to the
`ubuntu-latest` GitHub Actions browser jobs.

## Requirements

- Docker Desktop or a local Docker daemon
- Enough disk for the runner image, dependency store, Docker image cache, and
  Playwright browsers
- Enough memory for Docker-in-Docker plus the reference API stack

The first run downloads the base image, Node packages, Docker images, Chrome,
and Playwright browsers. Later runs reuse Docker volumes named
`stynx-ci-local-workspace` and `stynx-ci-local-docker`.

The runner mounts the repository read-only, then copies it into a clean
container workspace before running CI commands. Local `node_modules`, build
outputs, coverage, reports, and logs are excluded so macOS or host-machine
artifacts do not leak into the Linux preflight. The container removes
`node_modules` before each run but keeps `.pnpm-store` inside the same workspace
volume so installs can reuse hardlinked package content.

## Commands

Run the STYNX framework lane from `ci.yml`:

```sh
scripts/ci-local/run.sh stynx
```

Run the STYNX release-prep lane from `release-prep.yml`:

```sh
scripts/ci-local/run.sh stynx-release
```

Run the reference app consumer lane from `reference-apps.yml`:

```sh
scripts/ci-local/run.sh reference-apps
```

Run only the browser-dependent gates:

```sh
scripts/ci-local/run.sh browser
```

Run only the reference web E2E gate:

```sh
scripts/ci-local/run.sh reference-web-e2e
```

Run the docs build and Lighthouse gate from `docs.yml`:

```sh
scripts/ci-local/run.sh docs
```

Run the local Linux CI sequence:

```sh
scripts/ci-local/run.sh all-linux
```

The root package exposes one local-CI entrypoint. Pass the job name after `--`:

```sh
pnpm run ci:local -- stynx
pnpm run ci:local -- stynx-release
pnpm run ci:local -- reference-apps
pnpm run ci:local -- browser
pnpm run ci:local -- all-linux
```

Set a lower free-space threshold only when intentionally debugging on a tight
Docker disk:

```sh
CI_LOCAL_MIN_FREE_KB=3145728 scripts/ci-local/run.sh install
```

Root Turbo tasks default to three concurrent package tasks inside the local
runner. Increase or lower that limit when tuning Docker Desktop memory:

```sh
CI_LOCAL_TURBO_CONCURRENCY=2 scripts/ci-local/run.sh lint
```

## Artifacts

The runner writes local evidence under `reports/ci-local/<timestamp>-<job>/`.
That path is ignored by git. Relevant files include:

- `metadata.txt`
- `dockerd.log`
- `reference-web/compose.log`
- `reference-web/compose-ps.txt`
- `reference-web/test-results`
- `reference-web/playwright-report`
- `docs/lighthouse`
- `coverage/*`

## Fidelity Limits

This runner is intentionally a preflight tool, not release evidence.

- Reference app closure evidence comes from GitHub Actions `reference-apps.yml`.
- Prompt 36 closure evidence comes from GitHub Actions Docs with Lighthouse artifacts.
- The local Linux container does not reproduce the `macos-latest` build matrix
  leg from `ci.yml`.
- Release publishing and GitHub Pages deployment still require their GitHub
  workflows. Reference-app image scans and SBOM artifacts are owned by
  `reference-apps.yml`, not the STYNX package release lane.

For faster Apple Silicon smoke tests, `CI_LOCAL_PLATFORM=linux/arm64` can be
used, but that run has lower browser fidelity because Google Chrome stable is
only installed in the runner for `linux/amd64`.

On Apple Silicon, the default `linux/amd64` runner may print QEMU
`pthread_getschedparam` warnings from Node. They are noisy but not a failure.

If dependency install fails with `ERR_PNPM_ENOSPC`, Docker's VM disk is too
small for the local preflight cache. Increase Docker Desktop's disk allocation
or manually prune unused Docker cache before retrying:

```sh
docker builder prune
docker system df
```
