---
adr_id: ADR-STYNX-1.5-FINAL-CI-REPAIR
title: Admit exact CI portability repairs after the final version marker
status: accepted
date: 2026-09-28
authors: ['Architect']
tags: [stynx, release, ci, security]
---

# Exact final-candidate CI repair

The first clean remote checkout of PR #308 exposed two differences from the
locally warmed workspace. TypeScript checked `@stynx-nyx/angular-i18n/testing`
before that package's build created `dist`; the package's test tsconfig had no
source mapping for its own testing subpath. Semgrep also reported four private
keys in the public, deterministic PKI test fixtures. The keys sign only test
certificates and PDFs, are excluded by the package's `files: ["dist"]` manifest,
and are not production credentials. Local `ci:stynx`, release policy, provenance,
and consumer tarball gates had passed on the candidate before these remote
findings.

The frozen 1.5.0 marker normally permits only round records and exact
forbidden-action receipts afterward. This decision admits precisely four
additional follow-up paths: this ADR; `.semgrepignore`, limited to the four
named test keys; `packages-web/angular-i18n/tsconfig.spec.json`, mapping its
own source and testing subpath; and the exact release-context implementation
that checks those paths and statuses. All public package manifests, sources,
generated `dist`, changesets, and version marker remain unchanged. The
allowlist does not accept any other source, test, workflow, or policy mutation.

The final PR must rerun the affected clean-checkout typecheck and Semgrep jobs,
the release-policy gate, and an independent delivery review of this delta.
The separate DEVAI RC refusal from the 100% coverage threshold remains open;
this decision does not lower that threshold or fabricate signed evidence.
