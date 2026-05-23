# Developer Documentation Standard

**Authority:** Architect (Constitution Article 6).

This document defines the minimum developer-documentation baseline for active
stynx packages.

## Package README Baseline

Every active backend package under `packages/*` must have a README that answers
these questions for a consumer:

- What problem does this package solve?
- What should be imported from the public barrel?
- How is the package wired into a NestJS host, CLI, or test harness?
- What data, tenancy, security, privacy, or audit assumptions does it carry?
- Which minimal example shows the intended usage?
- Which package-local commands verify the package?

The shared template is [../templates/package-README.md](../templates/package-README.md).
Package READMEs may add package-specific sections, but they should not omit the
baseline topics above.

## Public Barrel Documentation

Each package public barrel, normally `src/index.ts`, must carry package-level
TSDoc:

```ts
/**
 * Public package exports for ...
 *
 * @packageDocumentation
 */
```

This is the current hard floor for TypeDoc generation. It gives the docs site a
stable package entrypoint without requiring every type alias and simple token to
carry redundant prose.

## Symbol-Level TSDoc

Exported APIs need symbol-level TSDoc when the name and type signature do not
fully explain the contract. Required examples:

- exported NestJS modules and `forRoot` options;
- guards, interceptors, decorators, and middleware;
- adapters that perform external I/O;
- public services that mutate tenant data, audit logs, storage, or sessions;
- exported errors and policy decisions consumed by host applications.

Simple re-export barrels, DTO-only interfaces, and obvious tokens may rely on
package-level documentation until they become consumer pain points.

## Enforcement Plan

The repository does not enable blanket `eslint-plugin-jsdoc require-jsdoc`
today. A blanket rule would generate noise on tokens, type-only envelopes, and
barrel files before the baseline is curated.

Current enforcement is:

- package READMEs reviewed with code changes that add or rename public exports;
- package-level `@packageDocumentation` on active backend public barrels;
- generated API reference and link checks through `pnpm --filter docs build`;
- package tests proving exported barrels load where present.

Future hardening may add targeted lint rules after package-level TypeDoc output
is clean enough to avoid broad suppressions.

## RBAC Matrix Role

`docs/RBAC Matrix.md` is a generated diagnostic/template artifact for the
reference-app inventory. It is not the canonical framework RBAC implementation
or platform permission catalog. See [ADR-003](../adr/ADR-003-rbac-matrix-role.md).
