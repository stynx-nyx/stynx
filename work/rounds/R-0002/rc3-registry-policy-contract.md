# RC3 registry policy — STYNX 1.5.0

**Role:** Architect. **Scope:** the version PR for `1.5.0-rc.3`, after CTG-0003 merged on main `48b42874a3a660e648e1567b36da8d71668185a0` (tree `6a32b33bfbc5281e055b595886b8cde3af65c23c`). The Owner authorized all actions needed to complete C-0002, while publication still requires an action-specific exact-main-SHA receipt. The RC2 receipt and run `36356692969` proved `1.5.0-rc.2` for 44 packages; authenticated registry observations now have `rc=1.5.0-rc.2` and `latest=1.4.0`.

## Exact candidate and exception

`1.5.0-rc.3` is the only next candidate accepted by `scripts/lib/registry-version-policy.mjs`, `scripts/verify-release-policy.mjs --registry-monotonicity`, and `law/policy/registry-version-anomalies.json`. The fixed group remains 44/44/0. Registry preflight must observe all 44 authenticated packages, their already published `1.5.0-rc.2` history, `rc=1.5.0-rc.2`, and `latest=1.4.0`; the candidate must be absent. After publication, `rc` must equal `1.5.0-rc.3` on all 44 while `latest` stays `1.4.0`. Unknown or moving tags, partial publication, absent packages, a candidate already present, a future canonical version, or an unauthenticated response fail closed.

The existing one-package anomaly remains exactly `@stynx-nyx/angular-profile@2.0.0`, GitHub version ID `1024692931`, with its recorded integrity and SHA-256. It is noncanonical immutable history. The exception applies only when validating candidate `1.5.0-rc.3` and only to `registry-monotonicity-exception`; it does not authorize removal, deprecation, a 2.x release, or any other package/version. The Architect updates the policy JSON's Owner decision, superseded RC2, closure condition and exact candidate, then binds its SHA-256 in code. No workflow changes.

## Role sequence and proof

1. Architect records this contract and obtains an Opus 5.5 prompt-review PASS on the Inspector and Engineer prompts before dispatch.
2. Inspector changes only `test/scripts/release-version-policy.test.mjs`: exact RC3 equality against root and 44 manifests, RC2 history accepted, RC3 duplicate and later canonical versions rejected, exact anomaly-policy digest and wrong-candidate negatives, and RC2-to-RC3 dist-tag preservation. Focused tests must fail against the RC2-pinned implementation for the expected reason.
3. Architect updates `law/policy/registry-version-anomalies.json` and rebinds `law/trace.json` to the tests. A law commit is authored `DEVAI Architect`.
4. Engineer updates the candidate and pinned policy digest in `scripts/lib/registry-version-policy.mjs`, keeping all structural checks and the single anomaly exact. No opportunistic generalization. Engineer commits separately.
5. Verify focused tests, `pnpm check:trace --print`, authenticated registry monotonicity for 44, `pnpm ci:stynx`, reference apps, release policy/provenance/consumer fixtures, DEVAI forbidden strict, and Opus delivery-review. Version PR merges only with required checks and PASS. Hardening `scenario=all`, exact Owner publication receipt, and the package workflow occur only on the merged main SHA.

The initial authenticated preflight on the versioned branch failed closed because the current policy still expects `1.5.0-rc.2`; this is the reason for the bounded update. It is not a reason to disable monotonicity.
