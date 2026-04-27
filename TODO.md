# Open Questions & Follow-ups

Open items from the prompt-numbered workflow. Each references the corresponding prompt session. For current CI status, see GitHub Actions.

- [x] Revisit Prompt 31 browser e2e in a less restricted harness.
      Closed by GitHub Actions CI on `main`: run `24973824581` (`ci: parameterize k6 upload threshold for actions`, 2026-04-27) completed successfully and includes the Linux `reference-web-e2e` job.
- [x] Close Prompt 36 docs CI verification in GitHub Actions.
      Closed by GitHub Actions Docs on `main`: run `24972209610` (`ci: stabilize hardening and release gates`, 2026-04-27) completed successfully with `pnpm --filter docs build:ci`, including Chrome-backed Lighthouse execution.
- [ ] Finish Prompt 34 full k6 verification and baseline regression gating.
      The repo-side k6 fixes are in place, `auth` and `upload` are green on the host-backed `reference-api` path, and `crud` no longer fails functionally (`http_req_failed = 0`, no `429`s). Probe hardening improved the hot-path metrics materially: `data_tx_overhead_ms` and `idempotency_lookup_ms` now pass on the tuned CRUD path, and the default CRUD profile was lowered to `10 rps` with smaller default VU caps. The remaining open edge is `ratelimit_overhead_ms` p99, which is still noisy on repeated host-backed runs even after warmup + multi-sample measurement. Finish stabilizing that probe, rerun the clean full `auth`, `crud`, `upload`, and `cascade-delete` suite from a fresh stack, and then prove that `perf/k6/check-summary.mjs` is comparing against a prior successful `main` baseline artifact in CI.
- [ ] Close Prompt 35 mutation score gaps for `@stynx/auth`, `@stynx/data`, and `@stynx/tenancy`.
      The Stryker toolchain, narrowed mutation scopes, and CI artifact paths are fixed, but the package thresholds still need to be proven green with report-driven tests. The last completed narrowed-scope `@stynx/auth` report finished at `58.13`, with the main survivor clusters in `permission-cache.ts`, `stynx-auth.guard.ts`, `cognito-jwt.validator.ts`, `stynx-jwt.validator.ts`, `permission-query.service.ts`, and `utils.ts`. This checkout added new unit coverage for `permission-cache`, `permission-query.service`, and additional validator branches, but a fresh full auth Stryker rerun was aborted after startup because the single-worker in-place run projected roughly 5 hours. `auth >= 85`, `data >= 85`, and `tenancy >= 80` are still open and need another mutation pass after more targeted tests or faster Stryker execution settings.
- [ ] Finish Prompt 37 release readiness after Prompts 31 and 34-36 are green.
      The repo-side Prompt 37 substrate is now in place: major changeset stubs, top-level/per-package licensing, release draft generation, Semgrep/audit/Trivy/Syft workflows, and the ECR/Cosign release-artifacts workflow. What still blocks actual closure is the remaining browser-e2e, k6 baseline proof, mutation thresholds, CI-authoritative docs Lighthouse verification, and then the real `changeset version` / publish / GitHub Releases / ECR push-signing execution on green `main`.
      The TypeDoc/TSDoc public documentation warning blocker is now closed locally by `pnpm build` and the docs build path; keep Prompt 37 open for the remaining CI-authoritative browser, docs Lighthouse, k6, mutation, and release execution evidence.
- [x] Implement and adopt `porm` and `pec` integration facades over `@stynx/auth`.
- [x] Add optional middleware-based tenant DB lifecycle adapter for stacks requiring `res.on('finish'/'close')` semantics.
- [x] Expand package-level compatibility coverage to include:
  - tenant entitlement fallback parity
  - audit sink mode parity (`audit_write_function` vs `audit_event_table`)
  - identity-admin provider parity against `porm` and `pec`
- [x] Introduce package-native CI workflows and release automation (`changesets` or equivalent).
