# Local CI Browser Preflight

This repository keeps Prompts 31 and 36 tied to GitHub Actions evidence. A local
pass is useful for debugging and cost control, but it does not close those
prompts by itself.

## Purpose

Use the local preflight runner before pushing changes that affect browser,
docs, or Linux CI behavior. It runs the CI commands inside an Ubuntu container
with Node 24, pnpm 9, Docker-in-Docker, PostgreSQL client tools, Playwright, and
Chrome/Lighthouse support.

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

Run only the browser-dependent gates:

```sh
scripts/ci-local/run.sh browser
```

Run the reference web E2E gate from `ci.yml`:

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

The root package scripts expose the same entrypoints:

```sh
pnpm ci:local:browser
pnpm ci:local:all-linux
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

- Prompt 31 closure evidence comes from GitHub Actions `reference-web-e2e` on Ubuntu.
- Prompt 36 closure evidence comes from GitHub Actions Docs with Lighthouse artifacts.
- The local Linux container does not reproduce the `macos-latest` build matrix
  leg from `ci.yml`.
- Release publishing and GitHub Pages deployment still require their GitHub
  workflows. Prompt 37 no longer requires AWS/ECR/Cosign secrets; Release
  Artifacts builds local runner images and uploads SBOM/image metadata artifacts.

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
