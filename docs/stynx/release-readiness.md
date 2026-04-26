# v1.0 Release Readiness

STYNX has a real Prompt 37 release-prep substrate in-repo now, but it is **not shipped yet**.

## Implemented release-prep surfaces

- Major `1.0.0` changeset stubs for every publishable workspace package under `.changeset/`.
- Root `MIT` license plus per-package `LICENSE` files for every publishable package.
- Release policy verification script:
  - `pnpm release:policy`
- Changeset status + release draft generation:
  - `pnpm release:status`
  - `pnpm release:drafts`
- Release-prep GitHub Actions workflow:
  - Semgrep
  - dependency audit
  - package policy verification
  - release draft artifact generation
  - Trivy image scans
  - Syft SBOM generation
- Release-artifacts GitHub Actions workflow for:
  - ECR image push
  - Cosign signing
  - SBOM attachment as workflow artifacts
- ADRs remain published in the docs site under `Architecture Decisions`.
- The v1.1 planning issue template is staged under `.github/ISSUE_TEMPLATE/v1_1_planning.md`.

## Intentionally not marked complete yet

The following Prompt 37 success gates are still blocked outside the release scaffolding itself:

- Prompt 31 browser E2E still needs a non-sandboxed Playwright proof.
- Prompt 34 still needs full-suite k6 rerun plus CI baseline-regression proof.
- Prompt 35 mutation thresholds are not green yet.
- Prompt 36 Lighthouse verification is still CI-authoritative because local Chrome debug-port startup is blocked in this macOS sandbox.
- TypeDoc still emits documentation coverage warnings on public surfaces, so the `every public function is documented via TSDoc` checklist item is not green yet.
- Actual package publishing, GitHub Releases, and ECR push/signing must run in GitHub Actions with production secrets and roles.

## Pre-release vs post-release

The spec’s post-release tasks are intentionally **not** applied yet:

- `README.md` is **not** changed to `STYNX v1.0 - Shipped`.
- `pnpm changeset version` is **not** committed yet.
- `pnpm changeset publish` is **not** run from this checkout.

Those steps should only happen once the remaining blockers above are closed and CI is green on `main`.
