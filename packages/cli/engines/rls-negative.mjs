import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

/**
 * Static RLS-negative rules over the DDL under `ddlRoots`: every tenant-scoped
 * table (a `tenant_id`/`tenancy_id` column or a policy target) enables and
 * forces RLS and carries a tenant policy WITH CHECK. `runtimeEvidence` and
 * `coveragePath` add the repository's runtime-negative and evidence-manifest
 * rules. Read-only; a failure carries the file and line it concerns.
 */
export function verifyRlsNegative({
  root,
  ddlRoots = ['database/ddl'],
  runtimeDir = null,
  runtimeEvidence = [],
  coveragePath = null,
  coverageRequired = false,
}) {
  const repoRoot = resolve(root);
  const failures = [];
  const fail = (message, locator = null) => failures.push({ message, locator });

  const ddlFiles = [
    ...new Set(
      ddlRoots.flatMap((ddlRoot) => {
        const absolute = resolve(repoRoot, ddlRoot);
        if (existsSync(absolute) && statSync(absolute).isFile()) return [absolute];
        return walkFiles(absolute, '.sql').sort((left, right) => left.localeCompare(right));
      }),
    ),
  ];
  const sources = ddlFiles.map((file) => ({
    file: portable(relative(repoRoot, file)),
    text: readFileSync(file, 'utf8'),
  }));
  const ddl = sources.map((source) => source.text).join('\n');
  const tenantTables = [
    ...new Set([...discoverTenantScopedTables(ddl), ...discoverRlsPolicyTargets(ddl)]),
  ].sort((left, right) => left.localeCompare(right));
  const locate = (table) => locateTable(sources, table);

  for (const table of tenantTables) {
    const escaped = escapeRegExp(table);
    const helperPolicy = hasHelperPolicy(ddl, table);
    if (
      !helperPolicy &&
      !new RegExp(`ALTER\\s+TABLE\\s+${escaped}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'iu').test(
        ddl,
      )
    ) {
      fail(`${table}: missing ENABLE ROW LEVEL SECURITY`, locate(table));
    }
    if (
      !helperPolicy &&
      !new RegExp(`ALTER\\s+TABLE\\s+${escaped}\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'iu').test(
        ddl,
      )
    ) {
      fail(`${table}: missing FORCE ROW LEVEL SECURITY`, locate(table));
    }
    if (!hasPolicyWithCheck(ddl, table)) {
      fail(`${table}: missing tenant policy WITH CHECK`, locate(table));
    }
  }

  if (runtimeEvidence.length > 0) {
    const runtimeText = readRuntimeSpecs(
      repoRoot,
      resolve(repoRoot, runtimeDir ?? 'test/db/runtime'),
    );
    for (const [label, pattern] of runtimeEvidence) {
      if (!pattern.test(runtimeText)) {
        fail(`missing runtime negative coverage: ${label}`);
      }
    }
  }

  const coverageFile = coveragePath ? resolve(repoRoot, coveragePath) : null;
  if (coverageFile && existsSync(coverageFile)) {
    const coverage = JSON.parse(readFileSync(coverageFile, 'utf8'));
    for (const evidence of coverage.requiredEvidence ?? []) {
      const evidencePath = resolve(repoRoot, evidence.file);
      if (!existsSync(evidencePath)) {
        fail(`missing tenant isolation evidence file: ${evidence.file}`, `${coveragePath}:1`);
        continue;
      }
      const text = readFileSync(evidencePath, 'utf8');
      for (const pattern of evidence.patterns ?? []) {
        if (!text.includes(pattern)) {
          fail(
            `missing tenant isolation evidence: ${evidence.surface}: ${pattern}`,
            `${evidence.file}:1`,
          );
        }
      }
    }
  } else if (coverageFile && coverageRequired) {
    fail(`missing tenant isolation coverage manifest: ${coveragePath}`, `${coveragePath}:1`);
  }

  return {
    files: sources.map((source) => source.file),
    tables: tenantTables,
    failures,
  };
}

function locateTable(sources, table) {
  const [schema, name] = table.split('.');
  const patterns = [
    new RegExp(
      `CREATE\\s+TABLE\\s+(?:${escapeRegExp(schema)}\\.)?${escapeRegExp(name)}\\s*\\(`,
      'iu',
    ),
    new RegExp(`\\bON\\s+(?:${escapeRegExp(schema)}\\.)?${escapeRegExp(name)}\\b`, 'iu'),
    new RegExp(`'${escapeRegExp(schema)}'\\s*,\\s*'${escapeRegExp(name)}'`, 'iu'),
  ];
  for (const pattern of patterns) {
    for (const source of sources) {
      const match = pattern.exec(source.text);
      if (match) return `${source.file}:${source.text.slice(0, match.index).split('\n').length}`;
    }
  }
  return sources[0] ? `${sources[0].file}:1` : null;
}

function walkFiles(dir, extension) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(path, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [path] : [];
  });
}

function portable(path) {
  return path.split(sep).join('/');
}

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

function readRuntimeSpecs(repoRoot, root) {
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
