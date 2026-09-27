# Cross-family delivery-review — STYNX 1.5.0-rc.1 versioning

You are Claude Code Opus 5.5, independent read-only reviewer. Review
the RC1 versioning preparation on branch `feat/release-1-5-0-rc1`
against merged main CTG-0001 at
`e09bd6c00d56881fb5208a5e8fccfd6de3c0186a`. Focus on
`scripts/lib/fixed-group-version.mjs`, `scripts/version-packages.mjs`,
the Inspector tests, `.changeset/pre.json`, all 44 generated package
manifests/CHANGELOGs, root/template, READMEs, SBOM, trace and the
round's contract. Prompt-review of this versioning triad returned PASS
on exceptional cycle 3. The Owner requires `1.5.0-rc.1`, no missing
UPS-TEN-01…06, and no publication without an action-specific receipt.

Check especially: exact 44-package fixed group; pre-enter state and
consumed IDs; native Changesets 2.0.0-rc.0 corrected to 1.5.0-rc.1;
first/later/no-op/exit projections; fail-closed malformed/drift/major
states; post-Changesets tag, ordinal and consumed-ID validation before
rewrite; new versus prior changelog sections; stable release path;
package READMEs; frozen root SHA sensors and trace. Inspect the CI log
`/private/tmp/stynx-s15-rc1-ci.log` if available and distinguish a
running gate from a pass. The publication lane has a separate pending
prompt-review and is not authorized here; do not request a publish.

Do not edit files, mutate Git, publish or write in DETRAN. Return only
JSON:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS allows release-prep PR when gates are green; REVIEW requires
repair and another delivery-review; FAIL escalates. No Markdown fences.
