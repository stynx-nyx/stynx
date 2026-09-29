---
adr_id: ADR-STYNX-1.5.2-PKI-FIXTURE-SCAN
title: Admit exact public PKI test keys in the Semgrep fixture boundary
status: accepted
date: 2026-09-29
authors: ['Architect']
tags: [stynx, release, security, testing]
---

# Exact postrelease PKI fixture scan boundary

**Status:** Accepted.
**Authority:** Owner direction to close R-0003 and ADR-STYNX-1.5-FINAL-CI-REPAIR.

## Context

Remote Semgrep on STYNX 1.5.2 PR #314 reported four additional PEM private keys in `packages/signature/test/fixtures/pki/`: `bad-responder`, `chain-signer`, `expired-tsa`, and `intermediate`. They were generated to sign committed negative PKI and PDF test artifacts; the matching certificates and binary fixtures are public, deterministic test material. The `@stynx-nyx/signature` package publishes only `dist`, so these fixture keys do not enter its tarball. The 1.5.0 final CI repair already admitted exactly four analogous public test keys in `.semgrepignore` while leaving the scanner active for all other files.

## Decision

1. Add only these four exact fixture paths to `.semgrepignore`. Do not add a directory glob, alter Semgrep rules or severity, or suppress a finding outside the named public test fixtures.
2. Bind the complete eight-path exception in an Inspector test, including rejection of broad globs and non-fixture paths. Keep the PKI tests and their fixed certificates intact.
3. Extend only the 1.5.2 release-context follow-up contract to admit this ADR as an added path and `.semgrepignore` as a modified path. Keep source, workflow, and unrelated policy mutations rejected.
4. Rerun local CI, exact 44-package coverage, remote Semgrep, release gates, Opus delivery review, and signed DEVAI RC on the resulting clean SHA.

## Consequences

The scanner continues to inspect production sources and every nonlisted fixture. The eight committed keys remain public, nonsecret test data. No workflow or package publication policy changes.
