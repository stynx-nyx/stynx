#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = process.cwd();
const webRoot = resolve(repoRoot, 'reference/web');
const packageJson = JSON.parse(readFileSync(resolve(webRoot, 'package.json'), 'utf8'));
const playwrightConfig = readFileSync(resolve(webRoot, 'playwright.config.mjs'), 'utf8');
const fixtures = readFileSync(resolve(webRoot, 'test/e2e/fixtures.ts'), 'utf8');
const a11y = readFileSync(resolve(webRoot, 'test/e2e/a11y.ts'), 'utf8');
const failures = [];

const requiredCategories = [
  'auth',
  'audit',
  'documents',
  'flows',
  'i18n',
  'iam',
  'permissions',
  'profile',
  'records',
  'sessions',
  'smoke',
  'tenant',
  'trash',
  'work-items',
];

if (!packageJson.devDependencies?.['@axe-core/playwright']) {
  failures.push('@stynx/reference-web must install @axe-core/playwright');
}
if (!packageJson.devDependencies?.['@playwright/test']) {
  failures.push('@stynx/reference-web must install @playwright/test');
}
if (packageJson.scripts?.['test:e2e'] !== 'playwright test') {
  failures.push('@stynx/reference-web test:e2e must execute Playwright');
}
if (!a11y.includes("import AxeBuilder from '@axe-core/playwright'")) {
  failures.push('reference web a11y probe must use AxeBuilder');
}
if (!fixtures.includes('a11yProbe') || !fixtures.includes('{ auto: true }')) {
  failures.push('reference web fixtures must auto-run the a11y probe');
}
if (!playwrightConfig.includes("globalSetup: './test/e2e/a11y-global-setup.mjs'")) {
  failures.push('reference web Playwright config must reset the a11y report before runs');
}

for (const category of requiredCategories) {
  if (!playwrightConfig.includes(`'${category}/**/*.spec.ts'`)) {
    failures.push(`reference web spa-only project must include ${category}/**/*.spec.ts`);
  }
}

const staleComments = [];
walk(resolve(webRoot, 'test/e2e'), staleComments);
if (staleComments.length > 0) {
  failures.push(
    `reference web still has stale accessibility blocker comments: ${staleComments.join(', ')}`,
  );
}

if (failures.length > 0) {
  console.error('[frontend-a11y-gate] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[frontend-a11y-gate] OK: reference web Playwright accessibility gate is wired');

function walk(dir, staleComments) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, staleComments);
    } else if (entry.isFile() && path.endsWith('.ts')) {
      const text = readFileSync(path, 'utf8');
      if (
        text.includes('Blocked: @axe-core/playwright') ||
        text.includes('Blocked until @axe-core/playwright')
      ) {
        staleComments.push(path.replace(`${repoRoot}/`, ''));
      }
    }
  }
}
