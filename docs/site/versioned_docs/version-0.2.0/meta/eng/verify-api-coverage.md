# Verify API Coverage

`scripts/verify-api-coverage.mjs` compares an OpenAPI `paths` object with
implemented NestJS controller routes.

## Configuration

The verifier reads `.stynxrc.json#apiCoverage` first, then
`package.json#stynx.apiCoverage`.

```json
{
  "apiCoverage": {
    "openapiPath": "docs/framework/contracts/openapi.json",
    "sourceRoots": ["reference/api/src", "domain"],
    "routePrefix": "/v1"
  }
}
```

When no OpenAPI file exists, the verifier still reports implemented route count
so adopters can wire the check before generated contracts land.

## Usage

```sh
node scripts/verify-api-coverage.mjs --json
node scripts/verify-api-coverage.mjs --strict
```

`--strict` fails when OpenAPI and controller paths drift. Path comparison
normalizes duplicate separators, trailing slashes, and parameter syntax, so
`/v1/aits/&#123;id&#125;` and `/v1/aits/:id` match when the parameter positions match.
Remaining strict diagnostics include both the original path and the normalized
comparison key.
