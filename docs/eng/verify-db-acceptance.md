# Verify DB Acceptance

`scripts/verify-db-acceptance.mjs` performs a static acceptance pass over
canonical SQL files. It is not a replacement for a real migration smoke run; it
is the shared STYNX verifier that adopters can configure before wiring their own
database execution harness.

## Configuration

The verifier reads `.stynxrc.json#dbAcceptance` first, then
`package.json#stynx.dbAcceptance`.

```json
{
  "dbAcceptance": {
    "ddlPaths": ["database/ddl/*.sql"],
    "seedPaths": ["database/seed/*.sql"],
    "requiredSchemas": ["auth", "audit", "storage"],
    "requiredTables": ["audit.events"],
    "requiredRlsTables": ["audit.events"],
    "requireSeeds": true
  }
}
```

## Usage

```sh
node scripts/verify-db-acceptance.mjs --json
```

The script reports matched DDL/seed files and any missing schema, table, or RLS
requirements.
