# Engineer — STYNX 1.5.0 RC fixed-group versioning

Role: Engineer. Worktree:
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0`.
The maestro alone runs Git. Edit only
`scripts/lib/fixed-group-version.mjs` and `scripts/version-packages.mjs`.
Do not edit tests, generated manifests, `law/`, work records, workflows,
or DETRAN. Start only after Inspector sensors are recorded and red.

Implement `work/rounds/R-0002/plan.md` §Contrato de versionamento RC1.
Read the committed `pre enter rc` state in `.changeset/pre.json` in this
worktree without modifying it. Keep stable fixed-group behavior and the 44-package
roster. In `pre` mode, project the first candidate as 1.5.0-rc.1 and
subsequent candidates as rc.2, rc.3 only with a new changeset; do not
allow `changeset version` to replace prerelease with stable 1.5.0 or
major 2.0.0. Consumed `.md` files remain on disk; identify pending IDs
by subtracting `pre.json.changesets`. In `pre exit` (`mode: exit`),
project final stable 1.5.0 from the initial stable version and highest
bump across all changesets. A later declared major in pre mode fails
closed pending Owner OD. Reject malformed pre state or mismatched
tag/version/base, ignoring non-group initialVersions. Keep the existing
stable path and preview read-only. Use exact prerelease heading matching;
correct category headings if an over-promoted generated section says
`Major Changes` for a minor release.
Validate state before no-op: stable current version in pre mode requires
no consumed IDs; prerelease current version requires consumed IDs; every
consumed ID must have its `.md` file in both pre and exit modes. In exit
mode, a recomputed base different from the current prerelease base
fails closed. Reject malformed pre.json; absent pre.json retains the
stable flow. Preserve prior RC changelog sections byte-for-byte when
rewriting the newly generated section.
In exit mode, the script's no-op branch must use the exit plan, including
consumed group changesets. After `changeset version`, validate the
generated version before rewriting: in pre mode its tag must match
`pre.json.tag` and its ordinal must be 0 for the first RC or current+1
for a later RC; in exit mode it must be stable. Before any rewrite in
pre mode, verify `pre.json.changesets` equals its previous IDs plus
exactly the newly pending IDs, with unchanged mode and tag.

Run only focused script tests and `pnpm release:preview`; the latter
must show 1.4.0 → 1.5.0-rc.1 against the reset pre.json. The maestro
owns the real `pnpm version-packages` run after green, and Inspector
will then rebind the three exact root-manifest SHA-256 sensors in
`test/scripts/local-rc-blocker-contract.test.mjs`. Report source diff
and results; do not run Git, commit, push, open a PR, or publish.
