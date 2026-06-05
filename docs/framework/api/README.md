# API Documentation

OpenAPI is generated from the current STYNX NestJS controller sources and
verified against the canonical contract file at `docs/framework/contracts/openapi.json`.

```bash
pnpm api:docs:write
pnpm api:coverage
```

- `pnpm api:docs:write` regenerates the deterministic OpenAPI route inventory.
- `pnpm api:coverage` fails when source controller paths drift from the
  committed OpenAPI paths.
- Commit regenerated specs whenever you add or modify controllers that change
  the API surface.
