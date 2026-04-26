# GAP-000 — Bootstrap: Persist Gap-Porting Plan and All Prompts

**Priority:** Meta  
**Run from:** `./stynx` repo root  
**Must run first** — writes the plan and all subsequent prompts to disk before any implementation begins.

---

## Goal

Persist the full gap-porting plan and all six implementation prompts as spec files inside this repository so the work is traceable, reproducible, and reviewable before any code changes are made.

---

## Step 1 — Write the plan document

Create `docs/stynx/gap-porting-plan.md` with the following content:

```markdown
# Gap-Porting Plan: pec/porm excellence → stynx

**Date:** 2026-04-26  
**Source analysis:** cross-repo comparison of porm, pec, sgp, stynx  
**Status:** in-progress

## Context

stynx is the shared runtime platform for porm, pec, and sgp. Six gaps were
identified where peer repos have stronger, production-tested implementations
that should become the canonical stynx behaviour.

## Gaps

| ID      | Severity   | Package                     | Feature                                                    |
| ------- | ---------- | --------------------------- | ---------------------------------------------------------- |
| GAP-001 | CRITICAL   | `packages/audit`            | Append-only audit with cryptographic hash chaining         |
| GAP-002 | MEANINGFUL | root tooling                | Dead-code and orphaned-dep detection in CI                 |
| GAP-003 | MEANINGFUL | `packages/core`             | Per-variable ownership metadata in config schema           |
| GAP-004 | MEANINGFUL | `packages/sessions`         | Tenant-switch without logout (session exchange)            |
| GAP-005 | MEANINGFUL | `packages/storage`          | S3 Object Lock, lifecycle rules, presign rate limiting     |
| GAP-006 | MINOR      | `packages/ratelimit` + auth | SLO latency histogram + proactive permission drift re-sync |

## Execution order

Run prompts in order: GAP-001 → GAP-002 → GAP-003 → GAP-004 → GAP-005 → GAP-006.  
Each prompt is self-contained and can be re-run independently.

## Acceptance

All six gaps are closed when:

- `pnpm build` passes across all affected packages
- `pnpm test:unit` passes
- `pnpm test:int` passes (requires PostgreSQL 16)
- `pnpm lint` passes with zero warnings
```

---

## Step 2 — Copy all GAP spec files

Verify that the following files exist in `specs/`:

- `specs/GAP-001-audit-hash-chain.md`
- `specs/GAP-002-dead-code-detection.md`
- `specs/GAP-003-config-ownership.md`
- `specs/GAP-004-session-tenant-exchange.md`
- `specs/GAP-005-s3-lifecycle-lock.md`
- `specs/GAP-006-permission-drift-slo.md`

If any are missing, stop and report which files are absent before proceeding.

---

## Step 3 — Verify repo state is clean

Run:

```bash
pnpm build 2>&1 | tail -5
pnpm lint   2>&1 | tail -5
pnpm test:unit 2>&1 | tail -10
```

Capture and store the baseline output. If the build or lint is already broken, stop and report — do not proceed until the baseline is green.

---

## Verification

- [ ] `docs/stynx/gap-porting-plan.md` exists and is readable
- [ ] All six `specs/GAP-*.md` files exist
- [ ] Baseline build, lint, and unit tests are green
