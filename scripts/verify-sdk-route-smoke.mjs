#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = process.cwd();
const openApiPath = resolve(repoRoot, 'docs/framework/contracts/openapi.json');
const servicesDir = resolve(repoRoot, 'packages-web/sdk/src/generated/services');

if (!existsSync(openApiPath)) {
  throw new Error('OpenAPI contract missing. Run pnpm api:docs:write first.');
}

if (!existsSync(servicesDir)) {
  throw new Error('Generated SDK services missing. Run pnpm --filter @stynx-nyx/sdk codegen first.');
}

const contract = JSON.parse(readFileSync(openApiPath, 'utf8'));
const failures = [];
let operationCount = 0;

for (const [path, item] of Object.entries(contract.paths ?? {})) {
  for (const [method, operation] of Object.entries(item ?? {})) {
    if (!/^(get|post|put|patch|delete)$/u.test(method)) continue;
    operationCount += 1;
    const serviceName = `${pascalCase(operation.tags?.[0] ?? 'Default')}Service`;
    const servicePath = join(servicesDir, `${serviceName}.ts`);
    if (!existsSync(servicePath)) {
      failures.push(`${method.toUpperCase()} ${path}: generated service ${serviceName} is missing`);
      continue;
    }
    const serviceText = readFileSync(servicePath, 'utf8');
    const methodName = operationMethodName(operation.operationId);
    if (!new RegExp(`\\b${methodName}\\s*\\(`, 'u').test(serviceText)) {
      failures.push(`${method.toUpperCase()} ${path}: generated SDK method ${serviceName}.${methodName} is missing`);
    }
  }
}

if (operationCount === 0) failures.push('OpenAPI contract has no HTTP operations');

if (failures.length > 0) {
  console.error('[sdk-route-smoke] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[sdk-route-smoke] OK: ${operationCount} generated SDK operations matched`);

function pascalCase(value) {
  if (String(value).toLowerCase() === 'i18n') return 'I18N';
  return String(value)
    .replace(/[^A-Za-z0-9]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('');
}

function operationMethodName(operationId) {
  const normalized = String(operationId).replace(/i18n/giu, 'i18N');
  const parts = normalized
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean);
  return parts
    .map((part, index) =>
      index === 0
        ? `${part[0]?.toLowerCase() ?? ''}${part.slice(1)}`
        : `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`,
    )
    .join('');
}
