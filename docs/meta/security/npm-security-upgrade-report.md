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
The four overrides were changed in Engineer commit `6888f73f`; the frozen
install passed with the GitHub Packages credential provided as an environment
variable. `pnpm audit --json` and `pnpm audit --prod --json` then each reported
zero vulnerabilities. `pnpm security:sbom` regenerated the 172-component SBOM,
and `pnpm security:release` passed its SBOM, license, secret and production
audit gates. The full STYNX CI and GitHub alert reconciliation remain to be
checked before this remediation is declared closed. This change does not
publish replacement tarballs; a consumer-facing release would need the fixed
group version and normal release approvals.

## 2026-10-23 S8 verification-blocker remediation — targeted checks complete

This section records the S8 repair separately from the historical September
result above. The signed local RC for candidate `72616fe6` passed thirteen
nodes and then failed `security:audit` with twelve findings. It did not produce
a successful signed preparation receipt.

Engineer commits `c0f98c3f` and `d170b034` contain the dependency repair;
Inspector commits `17a89284` and `5a022d6b` bind the protected manifest bytes
without weakening their assertions. The verified source/test checkpoint is
`5a022d6b5a7727373098bdb826b1c75f74ffb008`. The repair retains DEVAI 2.6.2,
existing maintained security forks, severity levels and every release gate.
It updates reviewed patch/minor versions within their existing majors:
body-parser 1/2, fast-uri 3, serialize-javascript 7, multer 2, undici 7/8,
Zod 4, Puppeteer 25 and its scoped ws 8 path. The lock review includes related
body-parser children and preserves the pre-existing trace-engine
legacy-JavaScript resolution. Fourteen published packages declare Zod
`^4.6.6` as their direct minimum; reviewed existing-v4 tool paths resolve
4.6.7. An explicit fixed-group patch changeset accompanies the repair.
No package has been published by this work.

### Final audit and compatibility evidence

The first repair cleared production findings but left one high Zod 3 advisory
in the full graph. The final same-major Lighthouse/Puppeteer path repair and
ordinary optional-peer resolution removed Zod 3 entirely. The installed
DEVAI 2.6.2, OpenAI 4.104.0 and Anthropic 0.91.1 versions remain unchanged.
No SDK major override, global peer-policy change, provider removal or audit
waiver was needed.

Inspector independently verified **zero findings at every severity in the
production, full-workspace and CDK audits**. Reported dependency totals are
1697 production, 2552 full-workspace and 50 in the CDK audit's own metadata
population. These are separate audit scopes, not a combined component count.
Custody binds the exact inputs:

- Root manifest SHA-256: `ba8f8e848f65a3329217f9d43029bf7534ab7f34062298808835d11228aa4b1e`.
- Lockfile SHA-256: `11c133dd135cd34b2f66d3a7afa8f3c1b54c9d0cd3f962be70e15a9c8a737e63`.

The preserved evidence directory is
`/Users/aarusso/.local/share/stynx/consolidation-2026-10-23/inspector/s8-5a022d6b-security-verification`.
Its `s8-audit-final-custody.json` binds the three audit-report hashes and
metadata; `verification-scope.json` states the unsigned targeted-check scope.
Architect independently matched the current manifest and lockfile hashes to
that custody record before this documentation checkpoint.

Actual installed OpenAI and Anthropic SDK APIs passed local mocked-fetch
checks covering plain/JSON-object/strict-schema requests, content/usage/finish
handling and HTTP/network/timeout error behavior. Installed DEVAI `--help`
passed in an isolated credential-free environment. This invokes **direct SDK
APIs, not DEVAI's internal model bridge**, and performs no provider-network
acceptance. The evidence does not claim more.

A bounded local browser check passed using Lighthouse 13.4.1, Puppeteer
25.16.0 and Chrome 155.0.8059.85 against the existing `docs/site/build`. It
loaded the STYNX Docs title and passed the document-title audit, with an
isolated profile, external host resolution denied and browser/server cleanup.
This is browser compatibility evidence, **not a clean docs build, a full
Lighthouse audit or a signed RC**.

### Generated artifacts and remaining release checks

The official generators produced fourteen README edits limited to the direct
Zod minimum and a 177-component CycloneDX SBOM. Architect review of the final
SBOM diff found only the lockfile digest/derived serial and Zod 4.4.3→4.6.7
changes; no components were removed. The final SBOM lock digest matches the
custody record above. Its configured component scope is distinct from the
full dependency audit. Frozen materialization and the official generated
README/SBOM checks passed in the Engineer/Inspector repair sequence.

The official `pnpm check:trace --print` remains green with 711 executable tests
bound and 711 tracked. The three root-manifest SHA substitutions do not change
the verifier's assertion-call-site projection; no artificial trace rebind or
version bump is required. Existing invariant links and thresholds remain
unchanged.

Remaining work includes license/secret/fork checks in the Inspector window,
intended emitted-declaration review and official API baseline regeneration,
remaining STYNX gates, and a new successful signed local RC under the
coordinated resource window. `pnpm api:baselines:write` removes disposable
published-package dist outputs and runs the full build before writing; it has
not been bypassed or claimed complete at this checkpoint. Historical advisory
and exception records remain preserved; retiring an obsolete allowlist is a
separate governed change.

The repaired audits and targeted checks do not convert the failed candidate's
RC into a successful receipt. Integration, publication, formal DEVAI acceptance
and downstream DETRAN/PORM acceptance remain separate.
