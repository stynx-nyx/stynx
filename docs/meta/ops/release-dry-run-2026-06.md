# Release Dry Run - 2026-06

Round: R19 W03

Commit under test: local W03 working tree after W02 commit `b19382bb8`.

## Result

The release dry-run chain is green locally.

| Gate                 | Result | Evidence                                                                                                                                                                                        |
| -------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SBOM write           | Pass   | `pnpm security:sbom` wrote `docs/meta/security/sbom.cdx.json` with 157 components.                                                                                                              |
| Public API baselines | Pass   | `pnpm api:baselines:write` refreshed `docs/framework/contracts/public-api-baselines.json`.                                                                                                      |
| Release lane         | Pass   | `pnpm ci:stynx:release` completed SBOM check, license policy, secret scan, production audit, provenance, release policy, API baselines, consumer fixtures, and release drafts.                  |
| Build parity         | Pass   | `pnpm build` completed 40 tasks successfully. Docs-site warnings remain W08 documentation cleanup work, not release package blockers.                                                           |
| Dry publish          | Pass   | 37 publishable packages completed `pnpm publish --dry-run --no-git-checks --registry https://npm.pkg.github.com` with `NPM_CONFIG_PROVENANCE=false`. Logs are in `/tmp/stynx-r19-dry-publish/`. |

## Root Causes Fixed

1. The release-chain dependency graph had drifted under the lockfile. Root overrides now pin the audited production transitive versions:
   - `@grpc/grpc-js@1.14.4`
   - `joi@18.2.1`
   - `shell-quote@1.8.4`
2. The committed CycloneDX SBOM was stale relative to `pnpm-lock.yaml`; it was regenerated.
3. Public API declaration hashes had drifted after prior package changes; the baseline was regenerated.
4. The dry-publish inspection exposed publish tarball hygiene gaps:
   - `@stynx/data` was compiling `test/types` into `dist`.
   - `@stynx/testing` was compiling spec files and re-emitting workspace dependency sources because the publish build inherited repo source-path mappings.

`@stynx/data` and `@stynx/testing` now build through `tsconfig.build.json`, clean `dist` before compile, and override inherited `paths` for publish builds. Their normal `tsconfig.json` files remain the typecheck surface, so test typechecking is not silently dropped.

## Dry-Publish Parity

The local dry-publish command uses the same registry target as the GitHub release workflow by passing `--registry https://npm.pkg.github.com`. The CI workflow still owns real publication and provenance; local dry-run intentionally disables provenance because it does not publish.

Spot checks after the tarball-hygiene fix:

| Package          |    Before |     After | Notes                                                                                                    |
| ---------------- | --------: | --------: | -------------------------------------------------------------------------------------------------------- |
| `@stynx/data`    | 157 files | 109 files | Removed compiled `dist/data/test/types/*` from the package.                                              |
| `@stynx/testing` | 219 files |  39 files | Removed compiled specs and duplicate dependency package output; package now emits only `dist/testing/*`. |

## Remaining Follow-Up

- W08 owns the docs-site broken link and anchor warnings observed during `pnpm build`.
- No release-chain follow-up is required before continuing R19.
