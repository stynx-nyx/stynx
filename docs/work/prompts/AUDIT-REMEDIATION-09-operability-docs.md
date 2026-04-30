# 09 — Operability docs and runbooks

**Closes:** FIND-031, FIND-014, FIND-027 (MAJOR).
**Branch:** `audit-remediation/09-operability-docs`.
**Spec:** §11.5, §17.4.

## Why

- No `docs/operations/`. Zero of five spec-implied runbooks present.
- 14 of 16 backend packages have no README; 0 % TSDoc on
  `@stynx/{core,auth,data}` exports.
- No `docs/rfcs/` directory; SPEC §17.4 describes an RFC process.

## What to do

### Runbooks

Create `docs/operations/runbooks/` with these five:

1. `tenant-suspension.md` — how to suspend/restore a tenant; DB and
   Cognito steps; verification.
2. `lgpd-erasure.md` — invoking `@stynx/privacy` erasure end-to-end;
   live + archive; audit-trail expectations.
3. `session-revocation.md` — manual invalidation of a session/refresh
   token; Redis + DB steps.
4. `db-role-rotation.md` — rotating `stynx_owner` / `stynx_app` /
   `stynx_reader` passwords; PgBouncer reload.
5. `cognito-federation-onboarding.md` — adding an OIDC provider.

Plus `docs/operations/recovery/`:

- `pg-backup-restore.md`
- `kms-key-recovery.md`
- `cognito-user-pool-restore.md`

### READMEs

Create a shared template at `docs/templates/package-README.md`. For each
`@stynx/*` package missing a README, generate one covering:

- Scope (one sentence from spec §3).
- Public API surface summary (from `src/index.ts`).
- Peer dep requirements.
- Version compatibility table.
- Link to relevant spec section.

### TSDoc

Add `eslint-plugin-jsdoc` with `require-jsdoc` on all exported symbols
of `@stynx/{core,auth,data,storage,audit,sessions,tenancy,privacy}`.
Backfill TSDoc on the existing exports. Defer the rest of the
`@stynx/*` packages to a follow-up if effort overflows.

### RFCs

Create `docs/rfcs/` with:

- `0000-template.md` from SPEC §17.4 (Problem, Constraints, Options,
  Decision, Migration, Rollback).
- `0001-rationalization.md` backfilled from
  `docs/work/rationalization/`.
- One RFC per `specs/GAP-00x` doc (move them in or link).

## Acceptance

- All five `docs/operations/runbooks/*.md` exist with non-trivial
  content (each has a "Steps", "Verification", and "Rollback" section).
- All three recovery docs exist.
- `find packages -name README.md | wc -l` = 16.
- `pnpm -w lint` enforces TSDoc on the listed core packages.
- `docs/rfcs/0000-template.md` exists; ≥ 1 backfilled RFC present.

## Verify

```
ls docs/operations/runbooks/ docs/operations/recovery/
find packages -name README.md
pnpm -w lint
ls docs/rfcs/
```
