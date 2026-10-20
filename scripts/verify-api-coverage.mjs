#!/usr/bin/env node
import { verifyApiCoverage } from '../packages/cli/engines/api-coverage.mjs';

// The engine ships in @stynx-nyx/cli (`stynx verify-api-coverage --strict --json`, SM-07);
// this script keeps the repository's write pair (`--write-openapi`, api:docs:write).
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const { summary, drift } = verifyApiCoverage({
  root: process.cwd(),
  writeOpenApi: args.has('--write-openapi'),
});

if (args.has('--json')) console.log(JSON.stringify(summary, null, 2));
else
  console.log(
    `API coverage: ${summary.openapiPaths} OpenAPI paths, ${summary.implementedRoutes} implemented routes.`,
  );
if (strict && drift) {
  throw new Error(`API coverage drift detected:\n${JSON.stringify(summary, null, 2)}`);
}
