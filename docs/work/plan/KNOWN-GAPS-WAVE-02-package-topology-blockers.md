# Wave 02 — Package Topology Blockers

**Roles:** Architect decides; Engineer implements; Inspector verifies.
**Branch suggestion:** `known-gaps/02-package-topology-blockers`.
**Primary gaps:** P-01, P-02, P-03, P-06, Q-01.

## Purpose

Create the missing spec-shaped packages and settle architectural exceptions
before deleting legacy workspaces. This wave intentionally precedes workspace
rationalization.

## Inputs

- `docs/KNOWN_GAPS.md` sections 4 and 11
- `docs/work/prompts/AUDIT-REMEDIATION-03-create-contracts-package.md`
- `docs/work/prompts/AUDIT-REMEDIATION-04-create-angular-tenancy.md`
- `docs/work/prompts/AUDIT-REMEDIATION-05-privacy-i3.md`
- `packages/stynx-contracts/**`
- `packages/privacy/**`
- `packages/storage/**`
- `packages-web/angular-tenancy` if already present; otherwise scaffold target
- `reference/{api,web}/**`

## Tasks

1. Decide and document whether `RBAC Matrix.md` is guidance, template, or
   baseline implementation for a framework repo. Prefer an ADR.
2. Scaffold or complete `packages/contracts` as `@stynx/contracts`.
3. Migrate shared type exports from legacy `@stech/stynx-contracts` without
   breaking current package consumers.
4. Scaffold or complete `packages-web/angular-tenancy` as
   `@stynx-web/angular-tenancy`.
5. Move tenant-switch/client tenant-context UI from reference or legacy frontend
   into the Angular tenancy package.
6. Resolve privacy I3:
   - preferred: route object-store behavior through `@stynx/storage`;
   - alternate: write an ADR granting a narrow exception with lint allowlist.
7. Resolve `auth -> idempotency` layering by either removing the dependency or
   documenting the intentional direction.

## Acceptance

- `@stynx/contracts` exists, builds, exports package types, and consumers import
  from it where appropriate.
- `@stynx-web/angular-tenancy` exists, builds, and is consumed by reference web.
- Privacy no longer directly imports AWS SDK unless an ADR-backed exception is
  present.
- The RBAC Matrix role is no longer an open question.

## Verification

```sh
pnpm --filter @stynx/contracts build
pnpm --filter @stynx-web/angular-tenancy build
pnpm --filter @stynx/privacy test
pnpm lint:deps
pnpm typecheck
pnpm test
git diff --check
```
