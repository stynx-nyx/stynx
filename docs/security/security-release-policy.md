# Security Release Policy

**Authority:** Architect (Constitution Article 6).

This policy defines the release-security lane for STYNX framework packages.
`pnpm audit --prod` remains required, but it is only one control in the lane.

## Required Release Gates

- Production dependency audit: `pnpm audit --prod`.
- SBOM freshness: `pnpm security:sbom:check`.
- Direct external dependency license policy: `pnpm security:licenses`.
- High-confidence secret scan: `pnpm security:secrets`.
- Package provenance wiring: `pnpm release:provenance`.
- Package release policy and API baselines: `pnpm release:policy` and
  `pnpm api:baselines`.
- Packaged consumer fixtures: `pnpm release:consumer-fixtures`.

The combined local gate is:

```bash
pnpm security:release
pnpm release:provenance
```

## SBOM

Generate the repository SBOM with:

```bash
pnpm security:sbom
```

The generated artifact is `docs/security/sbom.cdx.json` in CycloneDX JSON
format. It records workspace packages, direct external dependencies resolved
from the installed pnpm graph, and the SHA-256 of `pnpm-lock.yaml`.

## License Policy

`docs/security/license-policy.json` is the allow/deny policy for direct
external dependencies. Strong copyleft licenses are denied by default for
framework release artifacts. Missing license metadata requires review.

## Provenance And Signing

Package publication must use npm provenance when registry publication is
enabled. For GitHub-hosted publication this means the publish workflow must run
with OIDC provenance enabled and must not publish from a developer workstation.

Container images are outside the framework package release lane. Reference-app
image SBOM and signing are owned by the reference-app workflow once deployment
environments and registry credentials exist.

## Vulnerability Remediation Lane

- Critical and high production vulnerabilities block release.
- Moderate production vulnerabilities require an owner-visible exception with
  affected package, exploitability, compensating control, and review date.
- Low vulnerabilities are reviewed in the next regular dependency window.
- Security-only dependency upgrades should avoid broad framework upgrades unless
  the advisory cannot be remediated otherwise.

## Dependency Review

Every dependency PR must show:

- why the dependency is needed;
- the package license;
- whether it is runtime, dev-only, peer, or optional;
- audit result after installation;
- affected public package API or generated SDK impact.
