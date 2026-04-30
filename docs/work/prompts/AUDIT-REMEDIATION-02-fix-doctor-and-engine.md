# 02 — Pin Node 24 and fix `pnpm doctor`

**Closes:** FIND-011, FIND-013 (MAJOR).
**Branch:** `audit-remediation/02-doctor-engine`.
**Spec:** §17 (CI gates).

## Why

- `package.json` declares `engines.node` as `>=24 <25` but every
  workspace prints `WARN Unsupported engine` because Node 22 is in use
  locally. The audit ran outside the supported runtime.
- `pnpm doctor` (wired to `scripts/stynx-doctor.mjs`) exits 0 with **no
  output**. The doctor command is the spec's authoritative I4
  route-coverage check; without output it is non-falsifiable.

## What to do

### Engine pinning

1. Add a `.nvmrc` file with `24` (or the minor in use by CI).
2. Add a `volta`/`mise` config (pick whichever the team uses) so
   `cd stynx && node -v` prints 24.
3. Add `scripts/check-engines.mjs` that exits non-zero if
   `process.versions.node` doesn't satisfy `package.json#engines.node`.
4. Wire `check-engines.mjs` into `ci.yml` as the first step.

### Doctor

1. Read `scripts/stynx-doctor.mjs`. Identify why it produces no output.
2. Confirm it implements every check listed in SPEC §17 (route
   coverage for I4, decorator presence for I6, `@ReadOnly` enforcement
   for I7, soft-delete archive mirror for I8). Add anything missing.
3. Make the script print a structured summary (JSON when piped, human
   when on TTY) and exit non-zero on any check failure.
4. Add `pnpm doctor` to `ci.yml` as a required check.

## Acceptance

- `node -v` on a fresh clone reports 24.x.
- `pnpm check:engines` exits 0 on supported, non-zero otherwise.
- `pnpm doctor` produces non-empty output describing each check's
  pass/fail status.
- Deliberately removing `@Permission` from one route in `apps/reference-api`
  causes `pnpm doctor` to fail.

## Verify

```
pnpm check:engines
pnpm doctor
pnpm doctor --json | jq .
```
