# stynx Packages

This workspace contains reusable, installable backend packages published as
`@stynx/*`. Web packages live under `../packages-web`.

## Package Groups

| Group                        | Packages                                                  | Purpose                                                                                           |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Contracts                    | `contracts`                                               | Framework-agnostic interfaces and error types.                                                    |
| Runtime foundation           | `core`, `data`, `backend`                                 | Request context, config, data access, migrations, and aggregate NestJS wiring.                    |
| Security and tenancy         | `auth`, `sessions`, `tenancy`, `ratelimit`, `idempotency` | Auth, session lifecycle, tenant validation, throttling, and mutation replay protection.           |
| Governance and observability | `audit`, `health`, `logging`, `privacy`                   | Audit evidence, metrics/readiness, structured logs, LGPD export/erasure, and ROPA.                |
| Platform features            | `storage`, `i18n`, `flow`                                 | Documents/object storage, localized messages, and workflow machinery.                             |
| Tooling                      | `cli`, `testing`                                          | Consumer commands, migrations, doctor checks, fixtures, matchers, and integration-test harnesses. |

## Documentation Baseline

Every active package directory has a README with:

- purpose and ownership boundary;
- install/import guidance;
- module, CLI, or test-harness setup;
- data/security model;
- minimal usage example;
- public API summary;
- package-local verification commands.

The canonical standard is
[`docs/architecture/developer-documentation.md`](../docs/architecture/developer-documentation.md)
and the reusable template is
[`docs/templates/package-README.md`](../docs/templates/package-README.md).

## Public Barrel Baseline

Every active backend package exports through `src/index.ts`, and every public
barrel carries package-level `@packageDocumentation` for TypeDoc generation.
Symbol-level TSDoc is required when exported services, modules, guards,
interceptors, decorators, adapters, errors, or options have non-obvious runtime
or security behavior.

## Consumer Entry Point

See [`docs/stynx/package-architecture.md`](../docs/stynx/package-architecture.md)
for the package topology and recommended host composition order.
