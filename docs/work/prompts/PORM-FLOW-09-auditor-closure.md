# PORM-FLOW-09 - Auditor: Final Flow Port Closure

**Discipline:** Auditor
**Run from:** `/Users/aarusso/Development/stech/stynx`
**Branch suggestion:** `porm-flow/09-audit-closure`
**Depends on:** `PORM-FLOW-01` through `PORM-FLOW-08`
**Scope:** Read-only verification plus a closure report. No implementation unless explicitly redirected by a human. No CMS.

## Goal

Audit the completed Flow port for STYNX and DEVAI compliance. Confirm `@stynx/flow` and `@stynx-web/angular-flow` are independently usable, tested, documented, and free of CMS/PORM domain coupling.

## Required Reading

Read:

- all `PORM-FLOW-*` prompt files;
- `docs/architecture/flow.md`;
- `docs/contracts/flow-api.md`;
- `docs/operations/runbooks/flow.md`;
- `packages/flow/**`;
- `packages-web/angular-flow/**`;
- `packages/data/migrations/platform/0014_flow.sql`;
- `packages/data/src/schema/flow.ts`;
- `../porting/porm-to-stynx/feature-matrix-flow.md`;
- `../porting/porm-to-stynx/gap-register.md`.

## Write Scope

Allowed:

- `docs/work/diag/porm-flow-closure.md`

Do not edit implementation, tests, package manifests, migrations, `.devai/state`, or CMS files.

## Audit Checks

Run and record:

```sh
git status --short --branch
git diff --name-only
pnpm --filter @stynx/data typecheck
pnpm --filter @stynx/data test:int
pnpm --filter @stynx/flow typecheck
pnpm --filter @stynx/flow lint
pnpm --filter @stynx/flow test
pnpm --filter @stynx/flow test:int
pnpm --filter @stynx-web/angular-flow typecheck
pnpm --filter @stynx-web/angular-flow lint
pnpm --filter @stynx-web/angular-flow test
pnpm --filter @stynx-web/angular-flow build
pnpm lint:migrations
pnpm lint:deps
pnpm lint:cycles
pnpm doctor
```

If environment dependencies block any test, record the exact command, error, and whether the failure is environmental or implementation-related.

## Static Audits

Run and interpret:

```sh
rg -n "cms\\.content|porm\\.opportunity|porm\\.proposal|porm\\.engagement|@backend/flow|DatabaseService|JwtAuthGuard|RoleGuard" packages/flow packages-web/angular-flow packages/data/src/schema/flow.ts packages/data/migrations/platform/0014_flow.sql || true
rg -n "flow" packages/data/migrations/platform/0014_flow.sql packages/data/src/schema/flow.ts packages/flow packages-web/angular-flow | head -200
git diff --name-only | rg '(^|/)cms|angular-cms|@stynx/cms' && exit 1 || true
```

The first command must return no forbidden generic-domain coupling except in comments that explicitly document excluded PORM source evidence. The CMS diff guard must return no files.

## Closure Report

Create `docs/work/diag/porm-flow-closure.md` with:

- scope and date;
- changed file groups;
- prompt sequence completion matrix;
- gate results with pass/fail/blocked status;
- STYNX invariant assessment;
- DEVAI discipline assessment;
- residual risks;
- explicit statement that CMS was not touched;
- recommendation: ready, ready with caveats, or not ready.

## Acceptance Criteria

- Closure report exists and is evidence-backed.
- All executable gates are run or explicitly blocked with exact reasons.
- No implementation changes are made by this Auditor prompt.
- CMS remains untouched.
