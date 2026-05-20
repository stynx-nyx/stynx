# FE Questions

## 2026-05-19 - FE-A gate policy while unrelated full gates are red

The A.1 worker completed the OnPush implementation and passed scoped web validation plus `pnpm test:matrix --no-color --coverage`, but the required worker gates are not all green:

- `pnpm lint` fails in dirty `packages/flow/src/*` Stryker-instrumented files outside A.1.
- `pnpm -r build` fails in docs Docusaurus broken-link checks outside A.1.
- `pnpm -r test` fails in `@stynx/testing` timeout outside A.1.

Decision needed: should the FE completeness programme pause until the parallel testing-pipeline/full-gate issues are green, or may FE-A continue using scoped FE/web evidence while recording full-gate failures as external blockers?

**Operator decision:** proceed with FE-A A.2-A.9 and skip the full `pnpm lint` gate temporarily. Continue to record scoped FE/web validation and external full-gate blockers in the wave report.

## 2026-05-19 - FE-A A.6 ng-packagr peer conflict

The A.6 worker stopped before editing files because the available `ng-packagr` releases do not cleanly match the current web-package toolchain:

- `ng-packagr@21.2.3` peers `typescript >=5.9 <6.0`.
- The checkout uses `typescript ^6.0.3`.
- `ng-packagr@22.0.0-rc.0` peers `typescript >=6.0 <6.1` but also peers `@angular/compiler-cli ^22.0.0-next.3`.
- The checkout uses `@angular/compiler-cli 21.2.10` in the Angular web packages.

Decision needed: should A.6 wait for an Angular 21-compatible `ng-packagr` release that supports TypeScript 6.0, downgrade TypeScript for the Angular package build lane, or explicitly adopt the Angular 22 RC toolchain for `packages-web` packaging?

**Operator decision:** adopt the Angular 22 RC toolchain for `packages-web` packaging.

## 2026-05-19 - FE-A A.7 official angular-eslint preset dependency authority

The A.7 worker found that the checkout does not currently install the official Angular ESLint packages:

- `node_modules/@angular-eslint` is absent.
- `pnpm-lock.yaml` has no `@angular-eslint/eslint-plugin`, `@angular-eslint/eslint-plugin-template`, or `@angular-eslint/template-parser` entries.

A.7 requires adopting `@angular-eslint:recommended` and `@angular-eslint/template/recommended`, not a local approximation of those rules. Completing that requirement therefore needs a dependency/config update beyond just `eslint.config.mjs`: add the Angular ESLint packages compatible with the adopted Angular 22 RC toolchain and update the lockfile, then wire the official flat-config presets and spot rules.

Decision needed: may the A.7 Engineer worker update the root dev dependency/lockfile surface for official `@angular-eslint` Angular 22 RC packages, or should A.7 stay blocked until that dependency policy is handled by a separate package/tooling authority?

**Operator decision:** authorize the A.7 Engineer worker to update root dev dependencies and the lockfile for Angular 22 RC-compatible `@angular-eslint` packages. Use `gpt-5.5` models for workers going forward.

## 2026-05-19 - FE-F F.2 publish/draft backend contract

The F.2 worker stopped before editing files because the publish/draft surface required by the wave is not backed by a current backend contract:

- `docs/api/openapi.json` has an empty `paths` object.
- `packages/flow/src/controllers/graphs.controller.ts` exposes graph list/get/export/create/import/update/delete plus node/edge/effect routes, but no publish route.
- `packages/flow/src/flow-design.service.ts` exposes list/get/create/update/delete graph methods only.
- `rg "publishGraph|/publish|flow.graph.publish|publishedVersion" packages/flow packages-web/angular-flow` found no implementation.

Decision needed: should FE-F F.2 wait for a backend `POST /flow/graphs/{id}/publish` contract, or may the FE-F worker scope expand to add the backend publish route and service semantics first?

**Operator decision:** Architect first. Write the publish/draft contract or ADR before Engineers implement FE-F F.2. Keep FE-F moving only on non-contract-dependent slices until that contract is pinned.

## 2026-05-19 - FE-C C.4 OIDC hosted action URL contract

The C.4 worker stopped before editing files because the handoff components required by the wave are not backed by a current auth/OIDC contract:

- `packages-web/angular-auth/src/oidc-client.adapter.ts` exposes only `checkAuth`, `authorize`, `logoff`, and `forceRefreshSession`.
- `packages-web/angular-auth/src/types.ts` exposes `StynxAngularAuthModuleOptions.oidc`, `loginRedirectRoute`, `permissionDeniedPath`, session storage options, and refresh-token storage options, but no change-password or MFA enrolment URL fields.
- `packages-web/angular-auth/src/provide-auth.ts` passes `options.oidc` directly to `provideAuth({ config })` and does not derive or publish hosted action URLs.
- `rg "change.?password|mfa|enrol|enroll|hosted" packages-web/angular-auth packages-web/angular-profile packages-web/sdk packages-web/angular -g '*.ts'` found no existing contract for these actions.

Decision needed: should the Architect add an explicit hosted-action contract to the auth surface, for example named URLs or provider-specific builders for `change-password` and `mfa-enrolment`, or should C.4 be split so avatar ships now and the two OIDC handoff components wait for that auth contract?

**Operator decision:** Architect first. Pin an explicit hosted-action contract for change-password and MFA enrolment before Engineers implement the C.4 handoff components.

## 2026-05-19 - FE-E E.5 audit events frontend contract

The E.5 worker route is blocked before implementation because the live backend audit HTTP contract differs from the FE wave assumption:

- `packages/audit/src/audit.controller.ts` exposes `GET /_audit/log` guarded by `platform:audit:read:*`.
- `packages/audit/src/audit.service.ts` exposes `listLog(...)` and `verifyChain(tenantId)`, but no event-detail, entity-history, or per-event integrity HTTP route.
- `docs/api/openapi.json` does not currently pin `/audit/events`, `/audit/events/{eventId}`, `/audit/entities/{kind}/{id}/history`, or `/audit/events/{eventId}/integrity`.

Decision needed: should FE-E target the existing `/_audit/log` platform-admin contract for the first audit package slice, or should an Architect/Engineer backend contract change land first for the planned `/audit/events` and entity-history API?

**Operator decision:** Architect first. Write the audit event/entity-history/integrity contract or ADR before Engineers implement FE-E E.5-E.8 against it.

## 2026-05-19 - Accepted FE-B through FE-H routing decisions

The operator accepted the orchestrator's recommended routing decisions:

- FE-D D.7 may use machine-translated first-pass `pt-BR` catalogs, preferring consistency and gate closure over final copy polish.
- FE-B should mount IAM in `reference/web` now; FE-H remains responsible for final reference/docs polish.
- IAM mutation configuration is deferred to FE-G; FE-B records lint/typecheck/build/unit/direct coverage evidence.
- The temporary root-lint waiver remains valid for FE-B through FE-F work, but root lint must be green before FE-G/FE-H promotion.

## 2026-05-19 - Architect FE contract pins

Architect pinned the FE-C C.4 hosted auth action contract in `docs/contracts/auth-hosted-actions.md`, the FE-E E.5-E.8 audit event/entity-history/integrity contract in `docs/contracts/audit-events-api.md`, and the FE-F F.2 publish/draft contract in `docs/contracts/flow-api.md` plus `docs/architecture/flow.md`. `ADR-FE-CONTRACTS-0001` records the decision. Engineer workers may proceed against those contracts; backend/auth implementation remains required where the live routes or adapter methods are not yet present.
