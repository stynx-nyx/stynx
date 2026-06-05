# ADR — Test Gate Tiers

**Status:** Accepted

**Date:** 2026-05-19

**Role:** Architect

## Context

The Wave 00 testing-remediation programme requires CI to distinguish fast pull-request
feedback from comprehensive test proof. The previous root gate, `ci:stynx`, covered engine,
lint, dependency, typecheck, unit, integration, build, and doctor checks, but it did not chain
the higher-cost D/E gates that the programme treats as release-relevant:

- `test:e2e`
- `test:mutation`
- `test:perf`
- `check:rls-smoke`

Running those gates on every pull request would make routine review feedback slower and more
fragile. Not running them anywhere makes the matrix appear healthier than the release substrate.

## Decision

STYNX has two CI tiers:

- **Fast PR tier:** `pnpm ci:stynx`
- **Comprehensive tier:** `pnpm ci:stynx:full`

`ci:stynx:full` is defined as:

```sh
pnpm ci:stynx && pnpm test:e2e && pnpm test:mutation && pnpm test:perf && pnpm check:rls-smoke
```

The GitHub Actions workflow runs the fast tier for pull requests. It runs the comprehensive tier
on the nightly schedule and on `release/**` branches.

## Consequences

Pull requests keep a single fast gate command that developers can reproduce locally. Nightly and
release-branch runs exercise the D/E gates without hiding their failures behind matrix rendering
or evidence aggregation.

If the comprehensive tier fails because a lower wave intentionally exposed an unimplemented test
surface, the failure is still real. The correct response is to record the blocker and route it to
the owning wave, not to skip a command from `ci:stynx:full`.
