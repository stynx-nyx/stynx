# Open Questions & Follow-ups

- [x] Revisit Prompt 31 browser e2e in a less restricted harness.
      Closed by GitHub Actions CI on `main`: run `24976849184` (`ci: stabilize k6 baseline comparison tolerance`, 2026-04-27) completed successfully and includes the Linux `reference-web-e2e` job.
- [x] Close Prompt 36 docs CI verification in GitHub Actions.
      Closed by GitHub Actions Docs on `main`: run `24972209610` (`ci: stabilize hardening and release gates`, 2026-04-27) completed successfully with `pnpm --filter docs build:ci`, including Chrome-backed Lighthouse execution.
- [x] Finish Prompt 34 full k6 verification and baseline regression gating.
      Closed by GitHub Actions Hardening on `main`: run `24973827712` seeded the first successful k6 baseline, and run `24976855814` completed successfully with the second k6 baseline comparison enforced.
- [x] Close Prompt 35 mutation score gaps for `@stynx/auth`, `@stynx/data`, and `@stynx/tenancy`.
      Closed by GitHub Actions Hardening on `main`: run `24976855814` completed successfully with mutation jobs for `auth >= 85`, `data >= 85`, and `tenancy >= 80`.
- [x] Finish Prompt 37 release readiness after Prompts 31 and 34-36 are green.
      Closed under the revised no-cloud-secret release-artifact scope. CI, Docs, Release Prep, Release, and two Hardening runs are green on `main`; Release Artifacts now builds reference images locally and uploads Syft SBOM plus image metadata artifacts without AWS, ECR, or Cosign secrets.
- [x] Implement and adopt `porm` and `pec` integration facades over `@stynx/auth`.
- [x] Add optional middleware-based tenant DB lifecycle adapter for stacks requiring `res.on('finish'/'close')` semantics.
- [x] Expand package-level compatibility coverage to include:
  - tenant entitlement fallback parity
  - audit sink mode parity (`audit_write_function` vs `audit_event_table`)
  - identity-admin provider parity against `porm` and `pec`
- [x] Introduce package-native CI workflows and release automation (`changesets` or equivalent).
