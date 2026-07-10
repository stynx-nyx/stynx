# Production Readiness Evidence

**Authority:** Architect (Constitution Article 6).

This is the local evidence ledger for the private regulated deployment bar in
[production-grade-private-regulated.md](production-grade-private-regulated.md).
It records the commands that must remain first-class gates before STYNX is
called production-grade for regulated private adopters.

## Local Required Gates

Run these before a release-candidate claim:

```bash
pnpm audit --prod
pnpm check:engines
pnpm api:coverage
pnpm api:contract
pnpm sdk:route-smoke
pnpm api:baselines
pnpm release:consumer-fixtures
pnpm check:rls-negative
pnpm frontend:production-smoke
pnpm frontend:a11y-gate
pnpm release:provenance
pnpm production:readiness-reference
pnpm security:release
pnpm lint
pnpm typecheck
```

## Focused Package Evidence

Critical frontend packages must keep deterministic package tests and fixture
exports where applicable:

- `@stynx-nyx/sdk`
- `@stynx-nyx/angular`
- `@stynx-nyx/angular-auth`
- `@stynx-nyx/angular-audit`
- `@stynx-nyx/angular-flow`
- `@stynx-nyx/angular-i18n`
- `@stynx-nyx/angular-storage`
- `@stynx-nyx/angular-tenancy`
- `@stynx-nyx/angular-ui`

The reference web app must keep Playwright and axe-based browser coverage wired
through `pnpm frontend:a11y-gate` and its own `pnpm --filter
@stynx-nyx/reference-web test:e2e` lane.

## Contract Evidence

- OpenAPI completeness and generated SDK coverage: `pnpm api:coverage`, `pnpm
api:contract`, and `pnpm sdk:route-smoke`.
- Public type/API drift: `pnpm api:baselines`.
- Consumer compatibility: `pnpm release:consumer-fixtures`.
- Tenant isolation: `pnpm check:rls-negative` plus the manifest at
  `docs/framework/contracts/tenant-isolation-coverage.json`.
- Release provenance: `pnpm release:provenance`.

## Remote And Human Evidence Pending

Local gates do not replace these production-grade private regulated deployment
decisions:

- Remote CI run on the release branch or PR.
- Registry publication dry run or controlled publish with provenance.
- Real adopter install rehearsal against the selected SGP, PEC, TEAT, or private
  fixture.
- Staging deployment rehearsal with real OIDC, database, object store, and
  secrets.
- Security/legal sign-off for license policy, vulnerability exceptions, and
  known limitations.
