#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const ddlDir = resolve(repoRoot, 'database/ddl');
const runtimeDir = resolve(repoRoot, 'test/db/runtime');
const coveragePath = resolve(repoRoot, 'docs/contracts/tenant-isolation-coverage.json');
const failures = [];

const ddlFiles = readdirSync(ddlDir)
  .filter((entry) => entry.endsWith('.sql'))
  .sort((left, right) => left.localeCompare(right))
  .map((entry) => join(ddlDir, entry));

const ddl = ddlFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
const tenantTables = [
  ...new Set([...discoverTenantScopedTables(ddl), ...discoverRlsPolicyTargets(ddl)]),
].sort((left, right) => left.localeCompare(right));

for (const table of tenantTables) {
  const escaped = escapeRegExp(table);
  const helperPolicy = hasHelperPolicy(ddl, table);
  if (
    !helperPolicy &&
    !new RegExp(`ALTER\\s+TABLE\\s+${escaped}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'iu').test(
      ddl,
    )
  ) {
    failures.push(`${table}: missing ENABLE ROW LEVEL SECURITY`);
  }
  if (
    !helperPolicy &&
    !new RegExp(`ALTER\\s+TABLE\\s+${escaped}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'iu').test(ddl)
  ) {
    failures.push(`${table}: missing FORCE ROW LEVEL SECURITY`);
  }
  if (!hasPolicyWithCheck(ddl, table)) {
    failures.push(`${table}: missing tenant policy WITH CHECK`);
  }
}

const runtimeText = readRuntimeSpecs(runtimeDir);
for (const [label, pattern] of [
  ['auth cross-tenant insert rejection', /rejects cross-tenant tenancy inserts/iu],
  ['auth cross-tenant update hiding', /hides cross-tenant updates/iu],
  ['audit cross-tenant insert rejection', /rejects inserts for another tenant/iu],
  [
    'storage tenant mismatch rejection',
    /rejects storage file inserts when the provided tenant mismatches/iu,
  ],
  ['storage tenant scoped read isolation', /sees only the current tenant files/iu],
]) {
  if (!pattern.test(runtimeText)) {
    failures.push(`missing runtime negative coverage: ${label}`);
  }
}

if (existsSync(coveragePath)) {
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
  for (const evidence of coverage.requiredEvidence ?? []) {
    const evidencePath = resolve(repoRoot, evidence.file);
    if (!existsSync(evidencePath)) {
      failures.push(`missing tenant isolation evidence file: ${evidence.file}`);
      continue;
    }
    const text = readFileSync(evidencePath, 'utf8');
    for (const pattern of evidence.patterns ?? []) {
      if (!text.includes(pattern)) {
        failures.push(`missing tenant isolation evidence: ${evidence.surface}: ${pattern}`);
      }
    }
  }
} else {
  failures.push(
    'missing tenant isolation coverage manifest: docs/contracts/tenant-isolation-coverage.json',
  );
}

if (failures.length > 0) {
  console.error('[rls-negative] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[rls-negative] OK: ${tenantTables.length} tenant-scoped tables checked`);

function discoverTenantScopedTables(sql) {
  const tables = [];
  for (const match of sql.matchAll(
    /CREATE\s+TABLE\s+((?:[A-Za-z_][\w$]*\.)?[A-Za-z_][\w$]*)\s*\(([\s\S]*?)\n\);/giu,
  )) {
    const table = match[1];
    const body = match[2];
    if (/\b(?:tenant_id|tenancy_id)\b/iu.test(body)) {
      tables.push(table.includes('.') ? table : `public.${table}`);
    }
  }
  return [...new Set(tables)].sort((left, right) => left.localeCompare(right));
}

function discoverRlsPolicyTargets(sql) {
  const targets = [];
  for (const match of sql.matchAll(
    /CREATE\s+POLICY\s+[A-Za-z_][\w$]*\s+ON\s+((?:[A-Za-z_][\w$]*\.)?[A-Za-z_][\w$]*)/giu,
  )) {
    targets.push(match[1].includes('.') ? match[1] : `public.${match[1]}`);
  }
  for (const match of sql.matchAll(/auth\.create_rls_policy\(\s*'([^']+)'\s*,\s*'([^']+)'/giu)) {
    targets.push(`${match[1]}.${match[2]}`);
  }
  return targets;
}

function hasPolicyWithCheck(sql, table) {
  const escaped = escapeRegExp(table);
  const directPolicy = new RegExp(
    `CREATE\\s+POLICY\\s+[A-Za-z_][\\w$]*\\s+ON\\s+${escaped}[\\s\\S]*?WITH\\s+CHECK\\s*\\(`,
    'iu',
  );
  if (directPolicy.test(sql)) return true;
  return hasHelperPolicy(sql, table);
}

function hasHelperPolicy(sql, table) {
  const [schema, name] = table.split('.');
  const helperPolicy = new RegExp(
    `auth\\.create_rls_policy\\(\\s*'${escapeRegExp(schema)}'\\s*,\\s*'${escapeRegExp(name)}'`,
    'iu',
  );
  return helperPolicy.test(sql);
}

function readRuntimeSpecs(root) {
  const files = [];
  walk(root, files);
  return files
    .map((file) => `\n-- ${relative(repoRoot, file)}\n${readFileSync(file, 'utf8')}`)
    .join('\n');
}

function walk(dir, files) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else if (entry.isFile() && path.endsWith('.spec.ts')) files.push(path);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
