# Workflows

**Authority:** Architect (Constitution Article 6).

One reference page per file under `.github/workflows/`, paired one to one by
stem. Required checks on `main` are listed in `.github/branch-protection.yml`.

- [audit](audit.md) — Weekly remote recalibration of the product tiers that `verified-local-rc` otherwise covers locally.
- [ci](ci.md) — Slim pull-request and branch CI.
- [devai-local-rc-verify](devai-local-rc-verify.md) — Verifies signed local RC evidence for the exact tree and publishes the `verified-local-rc` check run.
- [devai-main-observation](devai-main-observation.md) — Authenticated DEVAI audit observation of every exact `main` SHA, bound by the GitHub Actions host adapter.
- [docs](docs.md) — Builds the documentation site when documentation sources change.
- [hardening](hardening.md) — Scheduled k6 load scenarios against the reference stack.
- [module-demo-bookmark](module-demo-bookmark.md) — Build and security checks for the demo bookmark domain module.
- [reference-apps](reference-apps.md) — Builds the reference API and runs the reference web end-to-end suite and container security scan.
- [release-prep](release-prep.md) — Release readiness checks for package policy, dependency audit, static analysis and release drafts.
- [release-prep-not-applicable](release-prep-not-applicable.md) — No-op companion that resolves the path-filtered required checks of `release-prep.yml` on pull requests that change none of its paths.
- [release](release.md) — Publishes the release after the forbidden-action audit of the release range.
- [reusable-typecheck](reusable-typecheck.md) — Reusable workspace typecheck called by other workflows.
- [semantic-pr-title](semantic-pr-title.md) — Enforces Conventional Commit pull-request titles.
