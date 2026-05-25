#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const repoRoot = process.cwd();
const args = new Set(process.argv.slice(2));
const config = readConfig().dbAcceptance ?? {};
const ddlPaths = expand(config.ddlPaths ?? ['database/ddl/*.sql']);
const seedPaths = expand(config.seedPaths ?? ['database/seed/*.sql']);
const seedGroups = Object.entries(config.seedGroups ?? {}).map(([name, patterns]) => ({
  name,
  files: expand(Array.isArray(patterns) ? patterns : [patterns]),
}));
const requiredSchemas = config.requiredSchemas ?? ['auth', 'audit', 'storage'];
const requiredTables = config.requiredTables ?? [];
const requiredRlsTables = config.requiredRlsTables ?? [];
const sql = ddlPaths.map((file) => readFileSync(file, 'utf8')).join('\n');
const failures = [];

for (const schema of requiredSchemas) {
  if (!new RegExp(`create\\s+schema\\s+(if\\s+not\\s+exists\\s+)?${schema}\\b`, 'iu').test(sql)) {
    failures.push(`missing schema ${schema}`);
  }
}
for (const table of requiredTables) {
  const [schema, name] = table.split('.');
  if (
    !new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?${schema}\\.${name}\\b`, 'iu').test(
      sql,
    )
  ) {
    failures.push(`missing table ${table}`);
  }
}
for (const table of requiredRlsTables) {
  if (
    !new RegExp(
      `alter\\s+table\\s+${escapeRe(table)}\\s+enable\\s+row\\s+level\\s+security`,
      'iu',
    ).test(sql)
  ) {
    failures.push(`missing RLS enablement for ${table}`);
  }
}
if (seedPaths.length === 0 && config.requireSeeds === true) failures.push('no seed files matched');
for (const group of seedGroups) {
  if (group.files.length === 0 && config.requireSeeds === true) {
    failures.push(`no seed files matched for group ${group.name}`);
  }
}

const summary = {
  schemaVersion: '1',
  ddlFiles: ddlPaths.map((file) => relative(repoRoot, file)),
  seedFiles: seedPaths.map((file) => relative(repoRoot, file)),
  seedGroups: seedGroups.map((group) => ({
    name: group.name,
    files: group.files.map((file) => relative(repoRoot, file)),
  })),
  failures,
};
if (args.has('--json')) console.log(JSON.stringify(summary, null, 2));
else console.log(`DB acceptance: ${ddlPaths.length} DDL files, ${seedPaths.length} seed files.`);
if (failures.length > 0) throw new Error(`DB acceptance failed:\n${failures.join('\n')}`);

function readConfig() {
  const rc = join(repoRoot, '.stynxrc.json');
  if (existsSync(rc)) return JSON.parse(readFileSync(rc, 'utf8'));
  return JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).stynx ?? {};
}

function expand(patterns) {
  return patterns.flatMap((pattern) => {
    if (!pattern.includes('*')) return existsSync(pattern) ? [resolve(repoRoot, pattern)] : [];
    const dir = resolve(repoRoot, pattern.slice(0, pattern.indexOf('*')));
    const suffix = pattern.slice(pattern.indexOf('*') + 1);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(suffix))
      .sort()
      .map((name) => join(dir, name));
  });
}

function escapeRe(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
