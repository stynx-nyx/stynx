---
adr_id: ADR-CI-COMPOSE-0001
title: Keep reference-stack compose builds off bake entitlements
status: accepted
date: 2026-10-08
authors: ['Architect']
tags: [stynx, ci, docker, reference-apps]
---

# ADR-CI-COMPOSE-0001 — Keep reference-stack compose builds off bake entitlements

**Status:** Accepted.
**Authority:** Architect, under the Owner's standing direction that every
pull-request workflow stays green on the published runner image; the workflow
edit carries an Owner `FORBID-CI-WITHOUT-ADR` receipt.

## Context

`reference-apps.yml` starts the reference API stack with
`docker compose -f reference/api/docker-compose.yml up -d --build`, feeding the
GitHub Packages token to the image build as a file-based secret written by
`mktemp` outside the build context. Since 2026-10-08 the `ubuntu-latest`
runner ships a Docker Compose that delegates `--build` to `docker buildx bake`,
and the current buildx refuses a bake definition that reads a file outside the
working directory unless the caller passes `--allow=fs.read=<path>`:

```
#1 [internal] load local bake definitions
additional privileges requested: pass "--allow=fs.read=/tmp/tmp.sT44J0h8yX" to grant requested privileges
```

Compose exposes no flag to forward that entitlement. The job `reference-web-e2e`
fails before the stack starts on every pull request (first seen on #354),
while `main` last ran before the runner change.

## Decision

The reference-stack steps of `reference-apps.yml` and the k6 step of `hardening.yml` export `COMPOSE_BAKE=false`, so Compose builds the
image through its own builder path, as it did until the runner change. The
secret stays a file outside the context; nothing about the image, the
Dockerfile or the compose file changes. `reference/api/scripts/smoke-local.sh`
exports the same variable so a local Docker Desktop with the same Compose
release behaves like CI.

## Consequences

- `reference-web-e2e` runs again on pull requests and on `main`.
- When a Compose release lets `up --build` forward bake entitlements, the
  variable can be retired by a later decision; bake brings no benefit to a
  single-image build with one secret.
