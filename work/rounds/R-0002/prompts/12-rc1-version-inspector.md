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
   `2.0.0-rc.2` or `rc.1`; with no new ID outside
   `pre.json.changesets`, it is a no-op despite consumed `.md` files.
3. `pre exit` (`mode: exit`) from 1.5.0-rc.N projects stable 1.5.0
   from the fixed-group `initialVersions` advanced by the highest bump
   across all `.md` changesets, including consumed ones.
4. A later declared major in pre mode fails closed pending an Owner OD.
   Malformed `pre`, `exit`, or absent/stable state, tag mismatch, or
   version base drift fails closed. Drift is a missing or divergent
   fixed-group `initialVersions` member, prerelease tag mismatch, or
   prerelease base mismatch; ignore non-group entries.
5. Rewriting a generated over-promoted prerelease changes only the new
   changelog section and sibling dependency version lines; stable history
   and unrelated package references remain intact. Match exact headings
   so `rc.1` cannot match `rc.10`; check that a corrected minor RC
   section has no false `Major Changes` category, or explicitly codify
   existing stable-release category behavior.

Preserve the existing stable-flow tests and all other assertions. Run the
focused test with Node's test-name filter and script lint. The expected
red result before Engineer source change is evidence; report it plainly.
Do not run Git, commit, push, open a PR, or publish.
