# Inspector — STYNX 1.5.0 RC versioning sensors

Role: Inspector. Worktree:
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0`.
The maestro alone runs Git. Edit only
`test/scripts/release-version-policy.test.mjs`; do not edit source,
generated manifests, `law/`, work records, workflows, or DETRAN.

Read `work/rounds/R-0002/plan.md` §Contrato de versionamento RC1,
`scripts/lib/fixed-group-version.mjs`, `scripts/version-packages.mjs`, and
the existing fixed-group fixture/tests in this test file. Model a real
`.changeset/pre.json`: consumed `.md` files remain on disk and their IDs
appear in `pre.json.changesets`. Add focused
sensors that prove:

1. In Changesets `pre` mode with tag `rc`, initial unified 1.4.0 and a
   minor changeset, the fixed-group plan expects 1.5.0-rc.1, never stable
   1.5.0 or peer-inferred 2.0.0-rc.0; Changesets' native first RC is
   `rc.0`, so this is an intentional correction.
2. A subsequent RC with current 1.5.0-rc.1 and one newly introduced
   changeset expects 1.5.0-rc.2, whether Changesets generates a wrong
   `2.0.0-rc.2` or `1.5.0-rc.2`; with no new ID outside
   `pre.json.changesets`, it is a no-op despite consumed `.md` files.
3. `pre exit` (`mode: exit`) from 1.5.0-rc.N projects stable 1.5.0
   from the fixed-group `initialVersions` advanced by the highest bump
   across all `.md` changesets, including consumed ones. A new major
   that changes the recomputed base fails closed pending Owner OD.
4. A later declared major in pre mode fails closed pending an Owner OD.
   Malformed pre.json fails closed: unknown mode, missing or non-string
   tag, missing or non-object initialVersions, non-array changesets,
   and invalid JSON. An absent pre.json follows the existing stable rule.
   Drift also fails closed: missing or divergent fixed-group
   initialVersions member, prerelease tag/base mismatch, stable 1.4.0
   with a consumed ID (the failed cycle-1 state), prerelease manifest
   with no consumed IDs, or any consumed ID missing its `.md` file in
   pre or exit mode. Ignore non-group initialVersions entries.
   A generated version equal to the current prerelease or carrying a
   wrong tag also fails closed.
5. Rewriting a generated over-promoted prerelease changes only the new
   changelog section and sibling dependency version lines; stable history
   and unrelated package references remain intact. Place a prior
   `## 1.5.0-rc.1` section below the newly generated one and assert
   the prior section stays byte-identical when the new one becomes rc.2.
   Match exact headings
   so `rc.1` cannot match `rc.10`; check that a corrected minor RC
   section has no false `Major Changes` category, or explicitly codify
   existing stable-release category behavior.

Extend the existing preview-writes-nothing fixture to hash
`.changeset/pre.json` as well as manifests, changelogs and template.
Add an apply-path sensor from native `1.5.0-rc.0` to required
`1.5.0-rc.1`, including exact changelog heading and sibling lines.
For `mode: exit` with only consumed IDs, assert a non-null bump,
expected stable 1.5.0 and non-empty `plan.changesets`, so the script
cannot take its no-op path. Test that the pre-mode postcondition requires
`pre.json.changesets` after versioning to equal prior IDs plus precisely
the pending IDs.

Preserve the existing stable-flow tests and all other assertions. Run the
focused test with Node's test-name filter and script lint. The expected
red result before Engineer source change is evidence; report it plainly.
Do not run Git, commit, push, open a PR, or publish.
