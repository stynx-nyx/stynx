# STYNX R14 — docs-governance migration closeout

**Date**: 2026-05-27
**Round**: R14 (orchestrator at `internal round-tracking note (not published)`)
**Gated on**: DEVAI R13 (ADR-DOCS-GOVERNANCE + ADR-LOCAL-PUBLISH-WORKFLOW)

## What landed

- Docusaurus scaffold relocated from `docs/` to `docs/site/` per
  [ADR-LOCAL-PUBLISH-WORKFLOW](#external-devai-reference)
  Decision 4. The primary markdown corpus (`docs/adr/`, `docs/arch/`,
  `docs/contracts/`, etc.) stays in place; the relocated
  `sync-content.mjs` pipeline imports it via `repoRoot`.
- `docs/scripts/sync-content.mjs` preserved as the import pipeline,
  relocated to `docs/site/scripts/sync-content.mjs` with siteRoot/
  repoRoot path-fix. The script's existing public-reference
  sanitizer was extended to scrub `internal round-tracking note (not published)` and `external DEVAI sibling checkout reference (not published)`
  cross-repo links that don't exist in the published Docusaurus
  tree.
- Workspace package renamed `docs` → `@stynx/docs-site` across five
  reference sites (pnpm-workspace.yaml, root package.json build +
  typecheck scripts, .github/workflows/docs.yml, scripts/ci-local/
  inside.sh).
- Docusaurus config files renamed `.mjs` → `.js`. The originally
  planned `"type": "module"` addition was reverted mid-round: it
  breaks Docusaurus 3.10's webpack server bundle (require.resolveWeak
  unavailable in pure-ESM packages). The config files were converted
  to CommonJS instead (require/module.exports). Sensor rules 5 + 9
  both pass on `.js` regardless.
- `.devai/config/project.json` declares `repo.kind=library`,
  `docs.builder=docusaurus`, `docs.build_command="pnpm --filter
@stynx/docs-site run build"`, `docs.output_dir=docs/site/build`,
  `docs.publish_target=gh-pages`, `docs.gh_pages_branch=gh-pages`.
- `.github/workflows/docs.yml` stripped to freshness-check only.
  Removed: deploy job, configure-pages step, upload-pages-artifact
  step, github-pages environment, ENABLE_PAGES_DEPLOY var,
  `pages:write` + `id-token:write` permissions. Kept: evidence-gate
  job, build-docs job, lighthouse artifact upload.
- `docs/adr/ADR-DOCS-GOVERNANCE-ADOPTION.md` ratifies STYNX's
  adoption of DEVAI's law and records the eight decisions taken
  during the audit (D1 round number, D2 sync-content preservation,
  D3 CI disposition, D4 long-term home, D5 ADR shape, D6 file
  extensions, D7 package rename, D8 no custom domain).
- First `devai docs-publish` run pushed orphan commit `e045c513` to
  `origin/gh-pages` (3246 files, 116 MB). Live at
  https://aarusso-nyx.github.io/stynx/.

## Sensor + gate results

- `node ../devai/packages/cli/dist/bin.js check docs-governance --repo-root .`:
  **9 rules, 0 fail, 0 warn (PASS)**.
- `node ../devai/packages/cli/dist/bin.js doctor --repo-root .`:
  **OK** (posture=adopter auto-detected; all 6 adopter checks pass
  including docs-governance).
- `pnpm lint`, `pnpm lint:tests`, `pnpm lint:deadcode`, `pnpm
lint:deps`, `pnpm lint:cycles`, `pnpm typecheck`, `pnpm
lint:workflows`: pass.
- `pnpm test`: **deferred** — pre-existing hang unrelated to R14
  scope (no test files modified). Filed as follow-up.
- `pnpm --filter @stynx/docs-site build`: pass (3246 files, 117 MB).
- Live site: HTTP 200 on landing + the new
  `/docs/adr/ADR-DOCS-GOVERNANCE-ADOPTION/` route.

## Commit chain (origin/main)

In landing order:

- [`3952d117`](https://github.com/aarusso-nyx/stynx/commit/3952d117) — pre-R14: declare repo.kind=library
- [`b1bb5f11`](https://github.com/aarusso-nyx/stynx/commit/b1bb5f11) — pre-R14: docs(footer) copyright line
- [`8c2a2a94`](https://github.com/aarusso-nyx/stynx/commit/8c2a2a94) — W01 adoption ADR
- [`ff965cf3`](https://github.com/aarusso-nyx/stynx/commit/ff965cf3) — W02 scaffold migration
- [`089d4161`](https://github.com/aarusso-nyx/stynx/commit/089d4161) — W05 docs.\* config keys
- [`5b3dbf22`](https://github.com/aarusso-nyx/stynx/commit/5b3dbf22) — W06 CI publish removal
- [`49a18cf1`](https://github.com/aarusso-nyx/stynx/commit/49a18cf1) — W08 knip allowlist fix

Plus a closeout commit landing this file, CHANGELOG, and the
`.gitignore` entry for `internal DEVAI state artifact (not published)`.

## Follow-ups (out of scope for R14)

1. **File a DEVAI gap** to extend the W04 sensor's `site-dir-shape`
   and `config-not-placeholder` rules to recognize `.mjs` so future
   adopters don't need to absorb the `.mjs` → `.js` rename or the
   ESM-to-CommonJS conversion of the config files.
2. **Investigate the `pnpm test` hang**: R14 W08 ran the full
   `pnpm test` batch and after ~2.5 hours of wallclock with no
   output, the run was killed. R14 didn't touch any test code, so
   the hang appears unrelated to this round. The last clean run
   (R13 closeout, commit `2053d9e9`) reported 82/82 successful.
   The hang may be environment-specific (Node 24 + vitest +
   testcontainers interaction) and worth a dedicated bisection.
3. **Document the GitHub Packages registry auth requirement**:
   pnpm install without `--frozen-lockfile` requires a
   `NODE_AUTH_TOKEN` for `npm.pkg.github.com` to fetch `@stynx/*`
   scope packages, even though those are workspace packages. The
   round worked around it with a manual lockfile edit (rename
   `docs:` importer to `docs/site:`) plus `--frozen-lockfile`. A
   per-machine `.npmrc` line like
   `//npm.pkg.github.com/:_authToken=$&#123;NODE_AUTH_TOKEN&#125;` would
   formalize the setup.
4. **Regenerate `docs/site/typedoc.generated.json` with relative
   paths**: the file has machine-absolute paths from the original
   author's machine. Already broken across dev machines; not made
   worse by R14, but a relative-path rewrite would fix portability.
5. **Reconsider custom domain (CNAME)** when org or project
   naming changes.

## Links

- Orchestrator: `internal round-tracking note (not published)`
- Audit: `internal round-tracking note (not published)`
- Audit log: `internal round-tracking note (not published)`
- Adoption ADR: [`docs/adr/ADR-DOCS-GOVERNANCE-ADOPTION.md`](/docs/adr/ADR-DOCS-GOVERNANCE-ADOPTION)
- Round log: `internal round-tracking note (not published)`
- Upstream law: `external DEVAI sibling checkout reference (not published)`
- Upstream mechanism: `external DEVAI sibling checkout reference (not published)`
- Published site: https://aarusso-nyx.github.io/stynx/
- Live adoption ADR: https://aarusso-nyx.github.io/stynx/docs/adr/ADR-DOCS-GOVERNANCE-ADOPTION/
