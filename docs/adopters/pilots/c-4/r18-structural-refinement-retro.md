# R18 Structural Refinement Retro

**Date:** 2026-06-11
**Round:** R18 structural refinement and adopter-experience truth-up
**Author role:** Auditor
**Evidence roots:** `docs/work/round-18/`, `docs/meta/known-gaps.md`

## Framing Lesson

R18 started from four operator-selected themes, but W01 re-verification found that two were already substantially built before the round began: Playwright system e2e existed in `reference/web`, and `reference/web` was already a complete showcase rather than a skeleton. The round therefore narrowed those themes to taxonomy, naming, and guidance truth-up instead of adding duplicate harness or app code.

## Before And After

| Signal                                      |                   Before R18 |                              After R18 |
| ------------------------------------------- | ---------------------------: | -------------------------------------: |
| Package-level backend `*.e2e-spec.ts` files |                            8 |                                      0 |
| Controller/route wiring specs               | mislabeled under `test/e2e/` | 8 under `test/wiring/*.wiring-spec.ts` |
| Playwright system e2e specs                 |                           32 |                                     32 |
| Flow oversized files                        |        910 / 860 / 587 lines |     all flow source files <= 500 lines |
| Flow mutation score                         |             last known 84.66 |                  83.22, above break 80 |
| JSDoc-enforced packages                     |                            8 |                                     37 |
| Frontend guidance surfaces                  |           3 overlapping docs |        1 canonical guide plus pointers |

## Outcomes

- W02 created `docs/meta/adr/2026-06-11-test-taxonomy.md`, making system e2e, package integration, controller wiring, and unit/behavioral specs distinct.
- W03 renamed the 8 backend pseudo-e2e files without changing test content and updated package-local Vitest globs.
- W04 split flow runtime/design/forms internals while preserving public exports and API baselines.
- W05 added CI/API-key-gated Stryker Dashboard wiring and kept concurrency at 2 after evidence showed 4 was slower and less stable for angular-trash.
- W06 extended exported-surface JSDoc enforcement across all packages with no E3 pauses.
- W07 made `docs/meta/dev/frontend.md` the canonical frontend adopter guide and trimmed other surfaces to pointers.

## E1-E3

- E1: Approved before W03. W01 found zero exact backend `e2e-spec` config references; generic reference-app e2e surfaces were left untouched.
- E2: No flow mutation regression below the red line. Post-split flow mutation score was 83.22 against break 80.
- E3: No JSDoc surface exceeded the pause threshold. Highest W01 proxy count was backend at 44 export lines.

## Final Closeout

R18 is locally closed after W09. The blocker was not proven to be an R18 functional regression; it was a latent PDF/veraPDF reliability fault that R17's final green run did not cold-prove because the PDF lane was cache-hit.

Root cause:

- `LocalPdfRenderBackend` launched Chromium per render, used `networkidle` for static HTML, and had no explicit launch timeout.
- `@stynx-nyx/pdf` allowed Chromium unit tests and Docker veraPDF conformance to run in parallel.
- The veraPDF harness spawned and polled Docker in a way that could leave stale containers or lose parseable non-compliance output.
- Full `ci:stynx` also exposed a repo-wide integration setup hook timeout: migrated Postgres/Redis/LocalStack setup can exceed Vitest's 10s default under fan-out.

Fix summary:

- Reused one Chromium browser per backend with per-render pages, deterministic `dispose()`/`onModuleDestroy()`, `waitUntil: 'load'`, and an explicit launch timeout.
- Serialized the PDF package and veraPDF adapter test lanes, batched PDF/A fixture validation where possible, split long veraPDF corpus cases, and hardened Docker create/start/logs/rm cleanup.
- Added shared Vitest `hookTimeout: 60_000` and an explicit idempotency integration setup/teardown envelope so full `test:int` fan-out can initialize DB/container fixtures without false hook failures.

Gate evidence:

- Focused renderer: `pnpm --filter @stynx-nyx/pdf exec vitest run --config ./vitest.config.ts test/unit/pdf-renderer.spec.ts --reporter=verbose` exit 0; local HTML 207ms, Handlebars 50ms, full file 983ms.
- Package PDF: `pnpm --filter @stynx-nyx/pdf test` exit 0; 7 files / 16 tests.
- Cold workspace pressure #1: `pnpm test -- --force` exit 0; 82/82 tasks, 0 cached, 4m34.487s; `@stynx-nyx/pdf` 174.26s, renderer file 520ms; `@stynx-nyx/pdf-a-vera-docker` 234.47s.
- Cold workspace pressure #2: `pnpm test -- --force` exit 0; 82/82 tasks, 0 cached, 5m11.483s; `@stynx-nyx/pdf` 180.08s, renderer file 531ms; `@stynx-nyx/pdf-a-vera-docker` 268.37s.
- Full gate: `pnpm ci:stynx` exit 0; includes `test:int` 38/38, build 40/40, and doctor ok. Docs build still reports existing site-wide broken-link/anchor warnings but exits 0.

Hygiene: after the pressure runs, no `chromium`, `vitest`, or `verapdf` processes were left, and no veraPDF containers remained.

## R19 Candidates

- Split `packages/data/src/transaction.ts` in a dedicated RLS-focused round.
- Clean up existing docs-site broken links and anchors that are outside the W07 touched pages.
