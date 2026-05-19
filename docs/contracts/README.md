# Contracts

**Authority:** Architect (Constitution Article 6).

This directory is the canonical contract substrate for stynx. Contracts are the
stable shapes that packages, reference applications, and consumer applications
can compile or validate against without importing implementation internals.

## Contract Surfaces

- [auth-hosted-actions.md](auth-hosted-actions.md) — hosted identity-provider
  action URLs consumed by profile security handoff components.
- [audit-events-api.md](audit-events-api.md) — HTTP contract for
  `@stynx-web/angular-audit` list, detail, entity-history, and integrity views.
- [flow-api.md](flow-api.md) — HTTP contract for `@stynx/flow` and
  `@stynx-web/angular-flow`.
- `errors.json` — shared error taxonomy and envelope metadata.
- [`@stynx/contracts`](/docs/packages/contracts) — TypeScript interfaces for
  auth, authorization, audit, storage, DB context, tenancy, errors, and
  identity-admin adapters.
- Generated API reference under the docs site, produced from package public
  barrels during `pnpm --filter docs build`.

## Authoring Rules

- Put implementation-free interfaces in `@stynx/contracts` when two packages
  need the same compile-time shape.
- Put protocol-specific HTTP/API contracts in this directory when they define a
  host-visible route family.
- Keep package READMEs consumer-oriented; use this directory for durable
  interface semantics.
- Any generated contract artifact must have a deterministic verification command
  in package or docs scripts.
