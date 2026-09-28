# STYNX 1.5.0 final PR clean-CI repair — delivery review

You are the independent Claude Code Opus 5.5 reviewer from the other model family. Review the exact local worktree HEAD against `718ed37cb11f617ffca62ede723d2511d8466919`, the first remote PR #308 head. Return JSON with verdict PASS, REVIEW, or FAIL, blocking findings with file/line evidence, and nonblocking notes. Do not edit files or run Git mutations. DETRAN is read-only.

Context: PR #308 is the one final integration PR. The first clean GitHub checkout failed `typecheck` because `packages-web/angular-i18n/test/testing.spec.ts` imported the package's own `./testing` subpath before ng-packagr created `dist`. It also failed optional Semgrep on four public, deterministic PKI test fixture keys in `packages/signature/test/fixtures/pki/{root,signer,spoof,tsa}.key.pem`; package `files` includes only `dist`. Local `ci:stynx`, reference apps, release policy/provenance/consumer fixtures had passed. A separate signed DEVAI RC preparation was refused at `release:prepare` because 14 packages miss its 100% global coverage threshold. That refusal remains open and must not be hidden.

Review:

1. `packages-web/angular-i18n/tsconfig.spec.json`: source path aliases for the package root and testing entry; assess clean checkout typecheck, runtime/package API effect, and test fidelity.
2. `.semgrepignore`: four exact test-key exclusions; assess if scope is narrow, rationale true, and no production secret or source exclusion is introduced.
3. `scripts/lib/release-context.mjs` and `law/adr/2026-09-28-final-candidate-ci-repair.md`: exact post-marker paths/statuses admitted while the 44 package manifests and source freeze stay intact. Check for any broadening or bypass beyond the named CI repair. The delta follows the final version marker; source files outside the exact paths must still reject.
4. Check `pnpm release:policy`, `pnpm --filter @stynx-nyx/angular-i18n test`, `typecheck`, trace resolution of the testing alias, and DEVAI forbidden strict evidence in the local environment if useful. Do not accept a prior local dist as proof of clean resolution; inspect the alias.
5. State explicitly whether the remaining 100% coverage refusal still prevents signed DEVAI RC evidence and whether an exact Owner Decision 8 authorization is needed for admin merge if `verified-local-rc` is the only remaining required check.

Do not require fixes for unrelated preexisting findings. Do not treat broad Owner consent as the exact Decision 8 receipt. The review is of this corrective delta; prior integrated delivery review PASS is already recorded.
