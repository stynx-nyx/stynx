# Prompt - FE Lift-Up Worker 02 - Feature Closure

## Runtime

Use `gpt-5.5` with high reasoning.

## Role

Default role is Engineer for package implementation. If the scope is test-only, operate as Inspector. If the scope requires contracts, ADRs, architecture docs, or threshold policy, operate as Architect. Follow Article 6 authority strictly.

## Required Reading

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/work/inv/FE-LIFTUP-current-inventory.md`
4. `docs/work/diag/FE-LIFTUP-current-diagnostics.md`
5. `docs/work/plan/FE-LIFTUP-completion-plan.md`
6. The target wave plan, one of:
   - `docs/work/plan/FE-WAVE-C-profile-sessions-completeness.md`
   - `docs/work/plan/FE-WAVE-D-storage-trash-i18n.md`
   - `docs/work/plan/FE-WAVE-E-tenancy-and-audit.md`
   - `docs/work/plan/FE-WAVE-F-flow-installable.md`
7. The existing target report, one of:
   - `docs/work/plan/FE-WAVE-C-report.md`
   - `docs/work/plan/FE-WAVE-D-report.md`
   - `docs/work/plan/FE-WAVE-E-report.md`
   - `docs/work/plan/FE-WAVE-F-report.md`

## Scope

The orchestrator will append a specific scope, for example:

- `Scope: FE-E E.7 EntityHistory`
- `Scope: FE-E E.10 audit catalogs`
- `Scope: FE-C C.6 SdkSessionsAdapter`
- `Scope: FE-F F.4-F.5`

Do not expand beyond the scope without reporting the reason.

## Implementation Rules

1. Reuse existing Angular patterns in `packages-web/*`.
2. Keep UI components standalone, OnPush, typed, and signal-driven at the UI layer.
3. Keep service/network flows RxJS based where the package already follows that pattern.
4. Use existing package translation and catalog conventions.
5. Add or update tests proportionate to the changed behavior.
6. Do not weaken thresholds in `scripts/test-matrix.config.json`.
7. Do not promote the wave. The Auditor promotes after validating all rows.

## Validation

Run package-scoped commands for the package you changed. Include global commands when the scope affects catalogs, routing, exports, or shared behavior.

Typical package gate:

```sh
pnpm -r --filter <package> lint
pnpm -r --filter <package> typecheck
pnpm -r --filter <package> build
pnpm -r --filter <package> test
```

Global gate when relevant:

```sh
pnpm i18n:check
pnpm test:matrix --no-color --coverage
git diff --check
```

## Closure

Append one row to the target `FE-WAVE-<X>-report.md` with:

- workstream ID and short name,
- commit or workspace scope,
- validation excerpt,
- changed behavior,
- remaining blockers.

If a gate fails outside your scope, record it precisely and stop.
