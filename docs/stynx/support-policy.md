# Support Policy

**Authority:** Architect (Constitution Article 6).

STYNX supports one active framework line for MVP adopters.

## Supported Runtime Matrix

| Surface    | Supported line                                                                     | Enforcement                             |
| ---------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| Node.js    | `>=24 <25`                                                                         | `engines` + `pnpm check:engines`        |
| pnpm       | `>=9 <10`                                                                          | `packageManager` + `pnpm check:engines` |
| Angular    | `>=20.3.0 <22`, tested on `21.2.15`                                                | package peer deps + package tests       |
| NestJS     | `^11.1.19`                                                                         | package manifests + consumer fixtures   |
| TypeScript | `5.9.3` for Angular packages; root tooling may use a newer compiler where required | package manifests + typecheck           |

## Compatibility Window

- A supported line receives security fixes and release-gate repairs until the
  next STYNX minor line is declared adopter-ready.
- New adopter applications should start on the current supported line only.
- Existing adopters receive one minor-line migration window before the previous
  line becomes maintenance-only.

## Upgrade Cadence

- Patch updates: monthly, or sooner for security advisories.
- Minor framework updates: after package API baselines, consumer fixtures, and
  reference app gates pass.
- Major Angular, NestJS, Node, or TypeScript updates: planned as explicit
  migration waves with compatibility notes, not bundled into unrelated fixes.

## EOL Policy

A line reaches end-of-life when any required runtime is itself outside upstream
security support or when maintaining compatibility blocks security remediation.
EOL notices must include:

- affected STYNX line;
- final supported runtime matrix;
- migration target;
- last planned patch date;
- known breaking changes.

## Adopter Migration Checklist

1. Run `pnpm release:consumer-fixtures` against the target STYNX line.
2. Run `pnpm api:baselines` and inspect public type drift.
3. Regenerate SDK clients from `docs/contracts/openapi.json`.
4. Run adopter package tests and browser smoke tests.
5. Review `docs/stynx/operational-readiness.md` for changed runbooks or known
   limitations.
