# ADR: Adoption of DEVAI's docs-governance law in STYNX

**Status:** Accepted.
**Date:** 2026-05-26.
**Author role:** Architect, per DEVAI Constitution Article 6.
**Related:** Upstream law [`../../../../devai/docs/meta/adr/ADR-DOCS-GOVERNANCE.md`](../../../../devai/docs/meta/adr/ADR-DOCS-GOVERNANCE.md);
upstream mechanism [`../../../../devai/docs/meta/adr/ADR-LOCAL-PUBLISH-WORKFLOW.md`](../../../../devai/docs/meta/adr/ADR-LOCAL-PUBLISH-WORKFLOW.md);
audit [`../../../../align/stynx/docs-governance-audit.md`](../../../../align/stynx/docs-governance-audit.md);
round orchestrator [`../../../../align/stynx/round-14/prompts/00-orchestrator.md`](../../../../align/stynx/round-14/prompts/00-orchestrator.md).

## Context

DEVAI R13 ratified a cross-repo documentation publishing law on 2026-05-26
(upstream commit `cf714e7`, ADR-DOCS-GOVERNANCE). The law mandates that every
governed library repo declare `repo.kind` and `docs.builder` in
`.devai/config/project.json`, ship a Docusaurus scaffold at `docs/site/`, and
publish the site to a `gh-pages` branch in the same repo via the
`devai docs publish` CLI verb. CI-driven publish is explicitly forbidden by
the companion ADR-LOCAL-PUBLISH-WORKFLOW Decision 10: the publish surface
must be a deliberate local act, not a workflow trigger.

STYNX is classified as a library by the upstream initial-classification table
(ADR-DOCS-GOVERNANCE Decision 5). Per Constitution Article 36, DEVAI applies
to itself transitively — STYNX, as a DEVAI adopter, must satisfy the law DEVAI
ratified.

Pre-adoption state, captured by the single-prompt audit on 2026-05-26
(`align/stynx/docs-governance-audit.md`):

- The Docusaurus scaffold lived at `docs/`, not the law-required `docs/site/`.
- Configuration files used the `.mjs` extension; the W04 sensor's
  `site-dir-shape` and `config-not-placeholder` rules only recognize
  `docusaurus.config.{ts,js}` and `sidebars.{ts,js}`.
- The workspace package was named `docs`, not the scoped form consistent with
  the rest of the repo (`@stynx/core`, `@stynx/pdf`, …).
- `.github/workflows/docs.yml` ran `actions/configure-pages` +
  `actions/upload-pages-artifact` + `actions/deploy-pages` behind the
  `ENABLE_PAGES_DEPLOY` repository variable, violating
  ADR-LOCAL-PUBLISH-WORKFLOW Decision 10.
- `.devai/config/project.json` declared neither `repo.kind` nor `docs.builder`.

The audit verdict was three hard-fail findings on `devai check docs-governance`:
`classification`, `builder-declared`, and `no-ci-publish`. Two more would
activate once the builder fact was declared: `site-dir-shape` (layout) and
`config-not-placeholder` (file-extension mismatch).

STYNX R14 closes all five findings in one round. The audit landed `repo.kind`
on `main` as an audit-scope patch; this ADR ratifies the broader adoption and
records the non-trivial decisions the operator made.

## Decision

Eight decisions, numbered to match the orchestrator's "Decisions locked" table
so cross-referencing is painless.

### D1 — Round number is R14, not R13

The audit prompt names `align/stynx/round-13/` for this work. STYNX R13 was
already in flight for PDF/A-2b conformance when the audit landed
(closeout commits `2053d9e9`, `cb1916f8`) and the two rounds are unrelated.
R14 numbering preserves R13's log integrity and isolates the docs-governance
work for future readers. Operator-authorized on 2026-05-26.

### D2 — Preserve `sync-content.mjs`, relocate to `docs/site/scripts/`

The pre-adoption build pipeline runs a 400-line script
(`docs/scripts/sync-content.mjs`) that performs MDX sanitization, public/internal
link rewriting (scrubbing references to `docs/work/`, `.devai/state/`,
`.ci/evidence/`, `coverage/test-evidence.json` so internal-only paths never
reach the published site), package-README aggregation, and status-page
generation. Two alternatives were considered:

- **Replace with a multi-instance Docusaurus docs plugin pointing at
  `../adr`, `../arch`, `../contracts`, …** Rejected because it would lose the
  sanitization layer — a real regression. Internal references to `.devai/state/`
  and `docs/work/` would leak into the published site.
- **Hybrid (plugin for safe trees, script for sanitized ones).** Rejected as
  more code, more wiring, for no operational gain over preserving the script.

Worker W02 moves the script to `docs/site/scripts/sync-content.mjs` and
path-fixes its `siteDir`/`siteRoot`/`repoRoot` constants. Worker W03 verifies
the relocated script produces a byte-equivalent generated tree.

### D3 — CI workflow disposition: freshness-check only

Per ADR-LOCAL-PUBLISH-WORKFLOW Decision 10, CI MUST NOT be the value-producer
for the docs site. Worker W06 strips three Pages-related actions
(`configure-pages`, `upload-pages-artifact`, `deploy-pages`), the
`ENABLE_PAGES_DEPLOY` variable gate, the `github-pages` environment block,
and the `pages: write` + `id-token: write` permissions from
`.github/workflows/docs.yml`.

The build job is retained as a PR-time freshness check — broken markdown
links and build regressions still surface at PR review time without
requiring an operator to run the build locally for every PR. Deleting the
workflow outright was the runner-up; rejected because losing PR-time
coverage made future regressions easier to land.

### D4 — `aarusso-nyx/stynx` is the long-term home

The git remote points at `https://github.com/aarusso-nyx/stynx.git`. The
pre-adoption Docusaurus config values (`url: 'https://aarusso-nyx.github.io'`,
`baseUrl: '/stynx/'`, `organizationName: 'stynx'`, `projectName: 'stynx'`)
are correct, not placeholders. The W04 sensor's narrow placeholder definition
(`PLACEHOLDER_URL_PATTERNS` = {`example.{com,invalid,test,org,net}`,
`your-docusaurus-site.example.com`, `localhost`}; `PLACEHOLDER_ORGS` =
{`facebook`, `organization-name`, `your-org`, `placeholder`, `devai-org`})
does not match either, so rule 9 passes.

A future migration to a different org is not in scope for R14. It would
require renaming the GitHub repo, updating the Docusaurus config, and
potentially migrating the `gh-pages` branch — a separate round.

### D5 — Adoption recorded as an ADR, not a closeout-only note

ADR-DOCS-GOVERNANCE Decision 3 only mandates an adopter-side ADR when an
application repo opts out to Jekyll. STYNX is a library — no opt-out, no
required ADR. The operator chose the ADR shape anyway because the migration
carries multiple non-trivial decisions (file extensions, package rename, CI
stripping, sync-content preservation) that a closeout note alone would not
durably surface. A lightweight note under `docs/adopters/` was the runner-up.

This ADR is the durable record. The closeout doc (W09,
`docs/work/2026-05-XX-docs-governance-migration-closeout.md`) is the
chronological record.

### D6 — File extensions: rename `.mjs` → `.js`, add `"type": "module"`

The W04 sensor's `site-dir-shape` and `config-not-placeholder` rules grep for
`docusaurus.config.{ts,js}` and `sidebars.{ts,js}`. STYNX uses `.mjs`. Two
paths:

- **Rename to `.js` + declare ESM in `docs/site/package.json`.** Chosen.
  `.mjs` and `.js` are semantically identical under Node ESM once
  `"type": "module"` is set on the package. The cost is mechanical (file
  rename + one JSON key).
- **File a DEVAI gap to extend the sensor to accept `.mjs`.** Rejected for
  R14 because it introduces a cross-repo dependency that would block this
  round until DEVAI ships a fix. The follow-up to file the gap upstream is
  flagged in the closeout doc — future operators may pick it up so adopters
  after STYNX don't hit the same friction.

### D7 — Package rename `docs` → `@stynx/docs-site`

The pre-adoption package name was the unscoped `docs`, which reads as a
directory rather than a workspace member. Renaming to `@stynx/docs-site`
brings the package under the STYNX scope alongside `@stynx/core`,
`@stynx/pdf`, `@stynx/auth`, etc., and makes the `--filter @stynx/docs-site`
invocations across `package.json`, `pnpm-workspace.yaml`,
`.github/workflows/docs.yml`, and `scripts/ci-local/inside.sh` consistent
with how every other STYNX package is referenced.

W02 updates all five touchpoints atomically.

### D8 — No custom domain

GitHub Pages serves the site at `https://aarusso-nyx.github.io/stynx/`.
A custom domain (CNAME) is permitted per ADR-LOCAL-PUBLISH-WORKFLOW
Decision 5 but adds DNS configuration and certificate-pinning overhead the
operator declined for R14. Future rounds may revisit when the org or
project naming changes.

## Consequences

- **Sensor-enforced compliance.** `devai check docs-governance` runs in
  `devai doctor` and catches drift the moment it lands. The five findings
  the audit surfaced close in R14 and cannot silently regress.
- **Durable record of non-trivial decisions.** Future operators reading
  this ADR can reconstruct WHY the layout looks the way it does (file
  rename, package rename, sync-content preservation, CI stripping) without
  re-reading the audit prompt or the round-14 log.
- **No DEVAI patch required.** The operator absorbs the local cost of the
  `.mjs` → `.js` rename rather than blocking R14 on an upstream sensor
  change. Follow-up to file the gap is captured.
- **Two trade-offs accepted.** (a) The file rename touches five reference
  sites; a stray miss would have broken the workspace at any of them. W02
  enumerates every site. (b) The `sync-content.mjs` path-fix is mechanical
  but fragile — W03's diff verification is the safety net that catches any
  regression before W04 runs.
- **`devai docs publish` is now part of the operator workflow.** Future
  docs releases require running the verb locally; no PR merge alone ships
  docs to the live site. The CI workflow now reports broken builds but
  does not publish.
- **`docs/typedoc.generated.json` machine-specific paths remain.** The file
  has absolute paths from the original author's machine; the regeneration
  is deferred to a follow-up because it is independent of the docs-governance
  migration.

## Alternatives Considered

- **(a) Keep the Docusaurus scaffold at `docs/`.** Rejected because the
  upstream law (ADR-DOCS-GOVERNANCE Decision 5 + ADR-LOCAL-PUBLISH-WORKFLOW
  Decision 4) requires `docs/site/`. The W04 sensor's `site-dir-shape` rule
  hard-fails any other location.
- **(b) Continue publishing via GitHub Actions.** Rejected because
  ADR-LOCAL-PUBLISH-WORKFLOW Decision 10 forbids it. The operator agrees:
  the deliberate local act is observable in real-time; a CI-driven publish
  hides failure modes inside an opaque runner.
- **(c) File a DEVAI gap and block R14 on upstream `.mjs` support.**
  Rejected per D6. The cost was low to absorb locally; the cross-repo
  dependency would have stalled R14.
- **(d) Replace the bespoke `sync-content.mjs` with a Docusaurus plugin.**
  Rejected per D2. The sanitization layer was the dealbreaker.
- **(e) Adopt the law without filing an ADR (closeout doc only).** Rejected
  per D5. The migration carried enough decisions to warrant a durable
  record.
- **(f) Defer the migration to a future round.** Rejected because the
  upstream law landed cleanly and every other library adopter is expected
  to convert in their next round. Delaying creates drift between STYNX and
  the rest of the ecosystem.

## Affected Rules / References

- **Constitution Article 6** (substrate authority-by-path) — `docs/`,
  `docs/meta/adr/`, `docs/site/`, `.devai/config/`, `.github/workflows/` are all
  Architect-owned in STYNX.
- **Constitution Article 36** (DEVAI applies to itself transitively) — STYNX,
  as a DEVAI adopter, satisfies the law DEVAI ratified upstream.
- **Constitution Article 38** (JSON canon) — `.devai/config/project.json`
  holds the classification and builder facts.
- **Upstream ADR-DOCS-GOVERNANCE** — defines `repo.kind`, `docs.builder`,
  the seven decisions enumerated upstream. STYNX adopts the law verbatim;
  Decisions 1, 2, 4, 5, 6, 7 apply here.
- **Upstream ADR-LOCAL-PUBLISH-WORKFLOW** — defines the publishing mechanism.
  STYNX's W05 lands the config keys (`docs.build_command`,
  `docs.publish_target`, `docs.gh_pages_branch`); W06 satisfies Decision 10
  (no CI publish); W07 runs the first publish.
- **STYNX R14 orchestrator** — `align/stynx/round-14/prompts/00-orchestrator.md`.
- **STYNX R14 workers** — `align/stynx/round-14/prompts/{01..09}-*.md`.
- **Audit prompt** — `align/stynx/docs-governance-audit.md`.
- **Audit log** — `align/stynx/docs-governance-audit-log.txt`.
- **R13 conflict reference** — `align/stynx/round-13/prompts/00-orchestrator.md`
  (PDF/A-2b conformance, the unrelated round whose directory the audit
  prompt would have collided with).
