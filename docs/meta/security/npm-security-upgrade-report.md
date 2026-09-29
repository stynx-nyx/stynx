# Dependency security upgrade report — 2026-09-28

**Current role:** Architect. **Scope:** STYNX frozen pnpm dependency graph at
`64d7906682d00ea929e1b48cb7b67e477a46766a`. The repository procedure is
`tools/npm-security-upgrade-auditor/SKILL.md`. This report separates observed
advisories from the verification of a future lockfile update.

## Inventory and proposed fixes

| Transitive package | Current root override | Fixed target | Current evidence                                                                                 | Upgrade class and impact                                             |
| ------------------ | --------------------- | ------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `fast-uri`         | `3.1.6`               | `3.1.7`      | Dependabot #177–178, high; AJV/webpack and tooling paths                                         | Patch; BSD-3-Clause; no direct manifest or public API change         |
| `multer`           | `2.3.0`               | `2.4.0`      | Dependabot #179, moderate; Nest platform-express runtime path                                    | Minor within `^2.2.0`; MIT; exercise upload integration paths        |
| `ip-address`       | `10.3.1`              | `10.5.1`     | Dependabot #175–176, moderate; docs/site LHCI proxy path                                         | Minor; MIT; exercise docs/site tooling                               |
| `undici`           | `7.29.0`              | `7.29.1`     | Additional `pnpm audit` moderate advisory, GHSA-3wwx-pv8p-q78v; docs/site and test tooling paths | Patch; MIT; no observed direct use of affected WebSocket client path |

The five Dependabot alerts and the sixth local-audit finding are distinct.
Before repair, the full audit reports two high and four moderate findings;
`pnpm audit --prod` reports two high and two moderate in the workspace graph.
The affected versions are pinned under the root `pnpm.overrides`; no major
upgrade or direct package dependency change is required. Target versions were
checked against published registry metadata. `pnpm outdated -r --json` could
not finish because the private DEVAI registry package returned 404 without
`NODE_AUTH_TOKEN`; targeted `npm view` checks resolved the four targets.

## Verification before closure

Engineer updates the four overrides and regenerates the frozen lockfile.
The generated CycloneDX SBOM must be rewritten by `pnpm security:sbom` so its
lockfile digest agrees. Then run frozen install, full and production audits,
`pnpm security:release`, affected upload/tooling checks, and `pnpm ci:stynx`.
Only verified post-change results may close the six advisories. The change
does not itself publish replacement tarballs; a consumer-facing release would
need the fixed-group version and normal release approvals.
