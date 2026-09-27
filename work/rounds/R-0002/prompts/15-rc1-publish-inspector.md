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
   Update the existing literal candidate assertion to rc.1 rather than
   removing it; retain stable-release negatives.
2. Import only the side-effect-free
   `scripts/lib/publication-dist-tag.mjs`, never the publisher script.
   Its `selectPublicationDistTag({version,preState})` derives `rc` only from valid
   `pre.json` mode/tag; rejects missing/malformed state, a mismatched
   tag, `latest`, and a stable candidate with pre.json present in
   either mode. The stable final path selects `latest` only when
   pre.json is absent. Assert typed errors
   `PUBLICATION_DIST_TAG_INVALID` for invalid state.
3. `buildNpmPublishArgs({tarball,registry,tag})` uses the selected tag;
   an RC cannot use
   `latest`. Publication plan and per-package receipts record candidate
   SHA/tree, version, tag, integrity, preflight/postflight dist-tags and
   stop-on-first-failure. `verifyPostPublishDistTags({candidate,
preflightLatest,distTags})` verifies registry `rc` resolves to the
   candidate and `latest` remains at its preflight value; unknown tags
   fail `PUBLICATION_DIST_TAG_UNKNOWN`, mutation fails
   `PUBLICATION_DIST_TAG_DRIFT`. Verify the publisher calls these pure
   helpers without importing/executing it.
4. Existing exact-main workflow guard and `--candidate-from-policy`
   remain unchanged. `assertNoPendingPreChangesets({preState,
changesetIds})` rejects an unconsumed `.md` at the candidate SHA;
   the 44 manifests, pre mode and exact tag are required before
   changesets/action can take its publish branch. No sensor may invoke
   real `npm publish`.

After test changes, the maestro Architect rebinds `law/trace.json` using
`pnpm check:trace --print` in a separate commit.

Keep all stable-release and negative tests. Run focused script tests
and lint. Expected red before Engineer implementation is evidence.
Do not run Git, commit, push, open PR or publish.
