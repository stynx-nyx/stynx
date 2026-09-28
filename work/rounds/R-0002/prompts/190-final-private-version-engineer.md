# Engineer — private workspace package restoration at final versioning

Declare Engineer. Read STYNX authorities and the final release context
contract plus Inspector test from prompt 189. Edit only
`scripts/version-packages.mjs` and a pure helper under `scripts/lib/`.
Capture private workspace package manifests/CHANGELOG bytes (or absence)
before native Changesets versioning and restore after that subprocess
even on nonzero status. Do not call the existing `run()` for this step:
it invokes `process.exit` before `finally` can restore. Use `spawnSync`,
restore in `finally`, then propagate the original nonzero status.
`result.error` or `status !== 0` (including null) is failure, exiting
with `status ?? 1` after restore. Attempt every captured restore even
if one fails; report both the Changesets result and all restore errors,
then exit nonzero. Keep restoration before generated validation,
fixed-group correction, root/public sync and SBOM. Pass the
Inspector's wrapper wiring assertion, including the failure path. Follow the
workspace roots in `pnpm-workspace.yaml` without scanning ignored
`node_modules`/`dist`; never touch the 44 public packages or root.
private discovery separate from `discoverPublishablePackages`; the root
already has `yaml` for parsing the workspace file. Keep the pre mode
RC path and preview behavior unchanged. No hand edit of
package manifests, CHANGELOGs, lockfile, SBOM, tests or generated output.
Restore `reference/api` and `reference/web` manifests byte for byte: their
SHA-256 freezes in `test/scripts/local-rc-blocker-contract.test.mjs`
must stay unchanged. Run focused Inspector test, lint and syntax; report.
The post-version diff check covers only root manifests/CHANGELOGs of
private workspace packages; the create-stynx-app template is allowed.
Also run `test/scripts/local-rc-blocker-contract.test.mjs` and
`test/scripts/release-version-policy.test.mjs`, then run
`node scripts/version-packages.mjs --preview` and confirm a clean diff.
Do not Git.
