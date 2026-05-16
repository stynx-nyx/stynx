<!-- Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692 -->

# Bookmark Module

Generated for demo/Bookmark — spec 0.1.0 sha a5553692.

## Overview

Domain module under namespace `demo`.

## API

- Base path: `/api/demo/bookmark/bookmark`
- Operations: list, get, create, update, delete
- Auth: guards declared via `BookmarkPolicyGuard` (RBAC + ABAC).

## Data model

See `db/migration.sql` for the canonical schema (`demo.demo__bookmark_bookmark`).

## UI

- Routes: `/demo/bookmark/bookmark`
- Auth: `BookmarkPolicyGuard` route guard.

## Security

- AuthN: Cognito JWT (cluster-level).
- AuthZ: RBAC roles consumed from `cognito:groups`; ABAC conditions evaluated by `policy.config.ts`.
- RLS: row-level security policies live in `db/rls.sql` (authored by Architect; not scaffolded).

## How to run

```bash
cd domain/demo-bookmark/api && npm ci && npm run build && npm test
```

## Decisions

See `ADR-0001.md` and successors.
