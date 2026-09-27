# Inspector — STYNX 1.5.0-rc.1 publication lane sensors

Role: Inspector. Worktree:
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0`.
The maestro alone runs Git. Start only after the RC1 version candidate
and Architect policy rebind are recorded. Edit only
`test/scripts/release-version-policy.test.mjs`; do not edit source,
manifests, `law/`, workflows, records or DETRAN.

Read `work/rounds/R-0002/plan.md` §Contrato da rota de publicação RC1,
the policy, `scripts/lib/registry-version-policy.mjs`,
`scripts/publish-release-plan.mjs`, `scripts/verify-release-policy.mjs`
and their existing sensors. Add focused tests for:

1. Exact candidate `1.5.0-rc.1` on the 44-package roster and exact
   anomaly exception only for angular-profile@2.0.0; 1.4.0 history,
   rc.0, an already published rc.1, stable 1.5.0 and any other 2.0.0
   must retain their correct monotonicity outcomes. Policy digest
   mismatch, missing policy and widened exception fail closed.
2. A pure dist-tag selector for prerelease derives `rc` only from valid
   `pre.json` mode/tag; rejects missing/malformed state, a mismatched
   tag, `latest`, and a stable candidate in pre mode. The stable final
   path selects `latest` only with valid exited/absent pre state.
3. The `npm publish` arguments use the selected tag; an RC cannot use
   `latest`. Publication plan and per-package receipts record candidate
   SHA/tree, version, tag, integrity and stop-on-first-failure. The RC
   post-check verifies registry `rc` resolves to the candidate and
   `latest` remains at its preflight value.
4. Existing exact-main workflow guard and `--candidate-from-policy`
   remain unchanged. No sensor may invoke real `npm publish`.

Keep all stable-release and negative tests. Run focused script tests
and lint. Expected red before Engineer implementation is evidence.
Do not run Git, commit, push, open PR or publish.
