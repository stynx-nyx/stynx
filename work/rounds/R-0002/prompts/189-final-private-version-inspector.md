# Inspector — private workspace package restoration at final versioning

Declare Inspector. Read STYNX authorities in AGENTS.md order and
`work/rounds/R-0002/final-release-context-contract.md` section
"Reparo do exit de pre mode para pacotes privados". Edit ONLY a focused
test under `test/scripts/` for a pure private-package snapshot/restore
helper to be implemented by Engineer. In a temporary synthetic workspace,
include a public package, private fork `tools/image-size-safe` version
`2.0.3-stynx.1`, another private package with an existing CHANGELOG, and
one without CHANGELOG. After synthetic Changesets mutations, assert
exact byte restoration of all private manifests and existing changelog,
deletion only of the newly created private changelog, and preservation of
both public files. Mirror `pnpm-workspace.yaml` with nested
`domain/*/api`, literal `docs/site`, a private `test/db` package without
`version`, and private-looking `package.json` decoys in `node_modules/`
and `dist/`; assert coverage/exclusion. Include a missing/malformed
manifest fail-closed case and restoration after a simulated Changesets
failure. Add a wrapper wiring assertion: capture must precede the
`changeset version` spawn, and restoration must happen on its success
and failure paths before generated-version validation,
`applyFixedGroupVersion`, `syncReleaseVersion`, and `security:sbom`.
This can use a stubbed subprocess in a synthetic workspace or a focused
structural assertion on the wrapper source; in the latter case it must
explicitly reject routing `changeset version` through the existing
`run()` helper that calls `process.exit` on failure, and require status
propagation only after a `finally` that restores the snapshot. A pure
helper failure simulation alone is insufficient. The assertion must fail
on the current wrapper and if restoration is moved after SBOM.
Exercise a `spawnSync` result with `status:null` or `error` and assert
restoration plus nonzero propagation; if restoration fails, its report
must retain the original Changesets failure and list restoration errors.
The diff check for private packages concerns only their root manifest
and CHANGELOG; the `create-stynx-app/template/package.json` is allowed.
Do not rebind the `reference/api` or `reference/web` manifest hashes in
`local-rc-blocker-contract.test.mjs`.
Do not edit implementation, generated files, docs, law, Git, or tests to
weaken the failure. Report red on missing helper.
