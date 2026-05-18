# Wave 08 — Developer Documentation

**Roles:** Architect for canonical docs; Engineer for package READMEs/TSDoc.
**Branch suggestion:** `known-gaps/08-developer-docs`.
**Primary gaps:** Doc-01, Doc-02, Doc-03, Doc-04, Doc-06 residue.

## Purpose

Reduce adoption cost after package topology is settled. This wave should avoid
documenting legacy packages that Wave 03 deletes.

## Inputs

- `docs/KNOWN_GAPS.md` section 8
- `docs/architecture/README.md`
- `docs/contracts/README.md`
- `docs/glossary/README.md`
- `docs/security/README.md`
- package READMEs under `packages/*` and `packages-web/*`
- public exports for core packages

## Tasks

1. Replace placeholder architecture/contracts/security/glossary READMEs with
   navigational documents that point to real substrates.
2. Add or normalize backend package READMEs from a shared template:
   purpose, install/import, module setup, data/security model, examples, tests.
3. Decide how strict TSDoc should be for exported APIs. Add lint enforcement
   only after the baseline is practical.
4. Ensure RBAC Matrix role decided in Wave 02 is reflected in docs.
5. Update `docs/stynx/package-architecture.md` or equivalent consumer entrypoint
   if present.

## Acceptance

- No top-level docs substrate remains a `devai init` placeholder.
- Every active backend package has a useful README.
- Exported API documentation expectations are explicit and enforced or tracked.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm --filter docs build
git diff --check
```
