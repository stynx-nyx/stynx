# Engineer — STYNX 1.5.0-rc.1 publication lane

Role: Engineer. Worktree:
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0`.
The maestro alone runs Git. Start only after Inspector sensors are red.
Edit only `scripts/lib/registry-version-policy.mjs`,
`scripts/lib/publication-dist-tag.mjs` (new pure module),
`scripts/publish-release-plan.mjs` and, if required by the contract,
`scripts/verify-release-policy.mjs`. Do not edit tests, `law/`,
workflows, records, manifests or DETRAN.

Implement `work/rounds/R-0002/plan.md` §Contrato da rota de publicação
RC1. Rebind `registryVersionPolicyConstants.candidate` to
`1.5.0-rc.1` and its digest to the exact Architect policy bytes, without
widening the angular-profile@2.0.0 exception or weakening authenticated
registry census. Use the existing SemVer comparator. Derive `rc` from
the committed pre mode state, fail closed on mismatch, and use the
selected tag in `npm publish`; stable final candidates use `latest`
only when pre.json is absent. Implement the exact pure function names
and error codes in the plan. Do not let tests import the side-effectful
publisher. Include dist-tag and SHA/tree in the plan and receipts.
Before publication, read every package's full dist-tags object and
record its `latest` and any existing `rc`; reject unknown/ambiguous
metadata. After each RC publish verify `rc` points to the candidate
and `latest` is unchanged, stopping immediately on drift. Restoration
of `latest` is a separate Owner-authorized mutation, never automatic.
Use `assertNoPendingPreChangesets` in the read-only release policy
check and publication preflight so an unconsumed changeset prevents a
candidate from silently entering the action's version-PR branch.
Preserve 44-package ordering,
integrity/shasum checks, unknown-state failure, stop-on-first-failure
and partial-recovery authorization requirement.

Run only focused tests, lint, preview/read-only release gates. Do not
invoke the real publication command, dispatch the workflow, execute
Git, commit, push or open PR. Report changes and results.
