# Verify STYNX Boundary

`scripts/verify-stynx-boundary.ts` checks that an adopter consumes STYNX through
declared package seams instead of app-local platform copies.

## Configuration

The verifier reads `.stynxrc.json#boundary` first, then
`package.json#stynx.boundary`.

```json
{
  "boundary": {
    "roots": ["apps", "domain"],
    "allowedPackages": ["@stynx-nyx/", "@stynx-web/"],
    "forbiddenImports": ["domain/shared/platform"],
    "requireStynxPackages": ["@stynx-nyx/auth", "@stynx-nyx/data"]
  }
}
```

## Usage

```sh
node --experimental-strip-types scripts/verify-stynx-boundary.ts
```

TEAT R3 can replace its local verifier with this STYNX script and move its
TEAT-specific role/action assertions into TEAT-owned tests.
