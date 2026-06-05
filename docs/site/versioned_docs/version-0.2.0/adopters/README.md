# STYNX Adopter Notes

This directory collects conventions and closeout notes for repositories adopting
STYNX packages.

Package-changing rounds must follow the adoption notes contract in
[`CONTRIBUTING.md`](/docs/contributing#adoption-notes-contract-for-package-changing-rounds).
That contract records public exports, migration paths, fixture compatibility,
verification commands, and any boundary decisions that intentionally leave
behavior in the adopter repo.

## PDF

- [PDF/A validation](pdf-a-validation.md)
- [STYNX PDF public payroll — adopter notes](stynx-pdf-public-payroll.md)

## Closeouts

- [STYNX R10 closeout — adopter notes](stynx-r10-closeout.md)
- [STYNX R12 closeout — PDF/A validator](stynx-r12-closeout.md)
- [STYNX R14 closeout — docs-governance migration](stynx-r14-closeout.md)

## Docs governance

Publishing the docs site is a local act via the DEVAI CLI:
`node ../devai/packages/cli/dist/bin.js docs-publish --repo-root . --human`.
See [ADR-DOCS-GOVERNANCE-ADOPTION](../meta/adr/ADR-DOCS-GOVERNANCE-ADOPTION.md)
for the rationale and the eight decisions taken during the R14 migration.
