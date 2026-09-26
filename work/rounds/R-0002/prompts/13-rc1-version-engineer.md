# Engineer — STYNX 1.5.0 RC fixed-group versioning

Role: Engineer. Worktree:
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0`.
The maestro alone runs Git. Edit only
`scripts/lib/fixed-group-version.mjs` and `scripts/version-packages.mjs`.
Do not edit tests, generated manifests, `law/`, work records, workflows,
or DETRAN. Start only after Inspector sensors are recorded and red.

Implement `work/rounds/R-0002/plan.md` §Contrato de versionamento RC1.
Read the actual Changesets `.changeset/pre.json` shape in this worktree
without modifying it. Keep stable fixed-group behavior and the 44-package
roster. In `pre` mode, project the first candidate as 1.5.0-rc.1 and
subsequent candidates as rc.2, rc.3 only with a new changeset; do not
allow `changeset version` to replace prerelease with stable 1.5.0 or
major 2.0.0. In `pre exit`, project final stable 1.5.0. Reject malformed
pre state or mismatched tag/version. Keep preview read-only.

Run focused script tests and `pnpm release:preview`. Report source diff
and results; do not run Git, commit, push, open a PR, or publish.
