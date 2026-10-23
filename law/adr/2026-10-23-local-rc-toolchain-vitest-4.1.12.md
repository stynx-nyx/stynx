---
adr_id: ADR-DEVAI-ADOPTION-0026
title: Rebind the local RC workstation toolchain to Vitest 4.1.12
status: accepted
date: 2026-10-23
authors: ['Architect']
tags: [stynx, devai, release, security]
---

# ADR-DEVAI-ADOPTION-0026 — Rebind the local RC toolchain to Vitest 4.1.12

**Status:** Accepted.
**Authority:** Owner direction on 2026-10-23 to move `vitest@4` to 4.1.12 for the Dependabot advisories GHSA-qxg6-89mg-rqv8 and GHSA-xp26-3454-mjgp (`@vitest/mocker`), as a toolchain refresh after the STYNX 3.0.0 publication.
**Amends:** `ADR-DEVAI-ADOPTION-0008` only for the current workstation-03 `vitest` toolchain value.

## Context

The root `pnpm.overrides` pin `vitest@4` and `@vitest/coverage-v8@4` to 4.1.11. Vitest 4.1.12 patches two `@vitest/mocker` advisories and moves the whole Vitest family (`vitest`, `@vitest/coverage-v8`, `expect`, `mocker`, `pretty-format`, `runner`, `snapshot`, `spy`, `utils`) to 4.1.12. The local RC preparer reads the installed `vitest` version and compares the toolchain control byte for byte, so it would fail closed: the law control records `vitest@4.1.11`. Node v24.20.0, pnpm 9.15.0, TypeScript 6.0.3 and Postgres.app psql 18.6 are unchanged.

The repository's native V8 coverage provider (`tools/repo-config/native-v8-provider.mjs`) reproduces Vitest's hard-coded coverage exclusions and requires the installed `vitest` and `@vitest/coverage-v8` versions to match. Between 4.1.11 and 4.1.12 the shipped `vitest` coverage and CLI code and the `@vitest/coverage-v8` provider differ only in their version strings, so the reproduced exclusions are unchanged.

## Decision

1. Raise the root overrides `vitest@4` and `@vitest/coverage-v8@4` to 4.1.12 and regenerate the lockfile and SBOM.
2. Rebind `law/policy/devai-local-rc-toolchain.json` to `vitest@4.1.12`. That is the only changed value. Regenerate the workstation-03 control with `node scripts/devai-local-rc.mjs controls` under the workstation-03 toolchain; nothing is inferred or bypassed.
3. The external workstation-03 toolchain control (`DEVAI_RC_TOOLCHAIN`) must carry the same bytes before the next `prepare`.
4. Signer, trust store, private-key custody, environment control, RC task roster and exact-candidate verification are unchanged.

## Consequences

Historical receipts keep their recorded toolchain. Future workstation-03 receipts are admitted with Vitest 4.1.12. Because the trusted verifier reads this control from `main`, a candidate that changes it cannot be verified until the control is on `main`, as with `ADR-DEVAI-ADOPTION-0025`. No publication, workflow-edit or bypass permission is granted.
