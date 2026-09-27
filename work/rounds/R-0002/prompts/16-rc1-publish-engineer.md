# Engineer — STYNX 1.5.0-rc.1 publication lane

Role: Engineer. Worktree:
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0`.
The maestro alone runs Git. Start only after Inspector sensors are red.
Edit only `scripts/lib/registry-version-policy.mjs`,
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
only in the appropriate exited/absent state. Include dist-tag and
SHA/tree in the plan and receipts. Before publication, record each
package's `latest` tag; after each RC publish verify `rc` points to
the candidate and `latest` is unchanged. Preserve 44-package ordering,
integrity/shasum checks, unknown-state failure, stop-on-first-failure
and partial-recovery authorization requirement.

Run only focused tests, lint, preview/read-only release gates. Do not
invoke the real publication command, dispatch the workflow, execute
Git, commit, push or open PR. Report changes and results.
