# devai-local-rc-verify

**Authority:** Architect (Constitution Article 6). Workflow edits need an Owner
`FORBID-CI-WITHOUT-ADR` receipt for the exact commit.

Reference page for `.github/workflows/devai-local-rc-verify.yml`
("DEVAI trusted local RC verification").

Verifies signed local RC evidence for the exact tree and publishes the `verified-local-rc` check run.

## Triggers

Pushes to `main` and manual dispatch with `candidate_sha` (dispatched by `pnpm devai:rc:publish`).

## Jobs

- `verify-attested-rc` "Verify trusted local RC evidence"

## Credentials

Secret `PACKAGES_READ_TOKEN`; variable `DEVAI_LEDGER_VERIFIER_PROVENANCE_SHA256`.

## Notes

The DEVAI-generated verifier core pins the DEVAI-designated package
`@aarusso-nyx/devai@2.4.0`. `verified-local-rc` is a required check on `main`.
Do not arbitrarily edit that core. The prospective closed STYNX-owned descriptor
admission extension is governed by
[ADOPTION-0022](../../../../law/adr/2026-10-12-supported-scorecard-task-collection.md).
It retains normal candidate/control descriptor equality and admits only the exact
reviewed four-task sensor/output-contract transition after both canonical digest
and reconstructed-delta checks. Trust, toolchain and environment stay sourced
from default-branch controls; exact policy byte comparison and all signature,
artifact and 15-node requirements remain mandatory. A future registered workflow
generation must preserve the reviewed extension or refuse pending review.

The first reviewed-branch dispatch needs the concrete Owner-authorized W0 CI
receipt and final F/C identity constraints in ADOPTION-0022. Preparation does not
grant dispatch, bypass a check or assert publication. After normal integration,
the default-branch descriptor matches and the ordinary equality path applies.

DEVAI 2.5.0 rematerializes this workflow through registered upgrade using the
already published 2.4.0 trusted verifier. Its required provenance digest is
`fc79da07d4d4dfa466548337a4944ae1b7e0bfdcf2f1c334b341bb1ad477cd4d`.
Before remote verification, independently verify the effective repository and
any environment override of `DEVAI_LEDGER_VERIFIER_PROVENANCE_SHA256`; generated
workflow bytes alone do not update that protected control. Preserve the existing
signer allowlist, exact-tree binding, inert candidate handling and package
integrity checks. The exact generated workflow commit needs its Owner receipt;
rebase landing requires the corresponding exact landed receipt under the same
recorded mandate. See [ADOPTION-0020](../../../../law/adr/2026-10-11-devai-2.5.0-adoption.md).
