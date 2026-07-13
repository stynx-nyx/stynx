# __MODULE__ Module

Generated for __NAMESPACE__/__MODULE__ — spec __SPEC_VERSION__ sha __SPEC_SHA__.

## Overview

Domain module under namespace `__NAMESPACE__`.

## API

- Base path: `/api/__NAMESPACE__/__kebabModule__/__kebabEntity__`
- Operations: list, get, create, update, delete
- Auth: guards declared via `__MODULE__PolicyGuard` (RBAC + ABAC).

## Data model

See `db/migration.sql` for the canonical schema (`__NAMESPACE__.__snake_table__`).

## UI

- Routes: `/__NAMESPACE__/__kebabModule__/__kebabEntity__`
- Auth: `__MODULE__PolicyGuard` route guard.

## Security

- AuthN: Cognito JWT (cluster-level).
- AuthZ: RBAC roles consumed from `cognito:groups`; ABAC conditions evaluated by `policy.config.ts`.
- RLS: row-level security policies live in `db/rls.sql` (authored by Architect; not scaffolded).

## How to run

```bash
cd domain/__moduleSlug__/api && npm ci && npm run build && npm test
```

## Decisions

See `ADR-0001.md` and successors.
