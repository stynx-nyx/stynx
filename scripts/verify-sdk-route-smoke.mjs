#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as ts from 'typescript';
import { pascalCase, operationMethodName } from './lib/sdk-operation-identities.mjs';

const repoRoot = process.cwd();
const openApiPath = resolve(repoRoot, 'docs/framework/contracts/openapi.json');
const servicesDir = resolve(repoRoot, 'packages-web/sdk/src/generated/services');

if (!existsSync(openApiPath)) {
  throw new Error('OpenAPI contract missing. Run pnpm api:docs:write first.');
}

if (!existsSync(servicesDir)) {
  throw new Error(
    'Generated SDK services missing. Run pnpm --filter @stynx-nyx/sdk codegen first.',
  );
}

const contract = JSON.parse(readFileSync(openApiPath, 'utf8'));
const failures = [];
let operationCount = 0;

for (const [path, item] of Object.entries(contract.paths ?? {})) {
  for (const [method, operation] of Object.entries(item ?? {})) {
    if (!/^(get|post|put|patch|delete|head|options|trace)$/u.test(method)) continue;
    const variants = operation['x-stynx-operation-variants'] ?? [];
    for (const selected of [
      operation,
      ...variants.filter(
        (variant) => variant['x-stynx-composition'] !== operation['x-stynx-composition'],
      ),
    ]) {
      operationCount += 1;
      const serviceName = `${pascalCase(selected.tags?.[0] ?? 'Default')}Service`;
      const alternate = selected !== operation;
      const compositionId = selected['x-stynx-composition'];
      if (
        alternate &&
        (typeof compositionId !== 'string' || !/^[a-z][a-z0-9-]*$/u.test(compositionId))
      ) {
        failures.push(`${method.toUpperCase()} ${path}: invalid alternate composition identity`);
        continue;
      }
      const servicePath = alternate
        ? join(servicesDir, '..', 'compositions', compositionId, 'services', `${serviceName}.ts`)
        : join(servicesDir, `${serviceName}.ts`);
      if (!existsSync(servicePath)) {
        failures.push(
          `${method.toUpperCase()} ${path}: generated service ${serviceName} is missing`,
        );
        continue;
      }
      const serviceText = readFileSync(servicePath, 'utf8');
      const methodName = operationMethodName(selected.operationId);
      const source = ts.createSourceFile(
        servicePath,
        serviceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      );
      const handlers = source.statements
        .filter(ts.isClassDeclaration)
        .filter((node) => node.name?.text === serviceName)
        .flatMap((node) =>
          node.members
            .filter(ts.isMethodDeclaration)
            .filter((member) => member.name.getText(source) === methodName),
        );
      if (handlers.length !== 1) {
        failures.push(
          `${method.toUpperCase()} ${path}: generated SDK method ${serviceName}.${methodName} is missing`,
        );
        continue;
      }
      const requests = [];
      const visit = (node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === 'this.httpRequest.request' &&
          node.arguments.length === 1 &&
          ts.isObjectLiteralExpression(node.arguments[0])
        ) {
          requests.push(
            Object.fromEntries(
              node.arguments[0].properties
                .filter(ts.isPropertyAssignment)
                .map((property) => [
                  property.name.getText(source),
                  ts.isStringLiteral(property.initializer) ? property.initializer.text : null,
                ]),
            ),
          );
        }
        ts.forEachChild(node, visit);
      };
      visit(handlers[0]);
      if (
        requests.length !== 1 ||
        requests[0].method !== method.toUpperCase() ||
        requests[0].url !== path
      )
        failures.push(
          `${method.toUpperCase()} ${path}: generated SDK method ${serviceName}.${methodName} targets a different HTTP operation`,
        );
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
